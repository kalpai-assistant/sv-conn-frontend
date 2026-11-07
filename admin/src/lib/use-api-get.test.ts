import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useApiGet } from "@/lib/use-api-get";
import { json, mockApi } from "@/test/harness";

/** Each call to a path waits until the test answers it, so answers can come in any order. */
function scriptedApi(paths: string[]) {
  const pending: Record<string, ((response: Response) => void)[]> = {};
  const routes = Object.fromEntries(
    paths.map((path) => [
      `GET ${path}`,
      () =>
        new Promise<Response>((resolve) => {
          (pending[path] ??= []).push(resolve);
        }),
    ]),
  );
  mockApi(routes);
  return {
    /** Answers the nth call to a path. */
    answer: async (path: string, nth: number, response: Response) => {
      await waitFor(() => expect(pending[path]?.[nth]).toBeDefined());
      await act(async () => {
        pending[path][nth](response);
      });
    },
  };
}

function render(path = "/a") {
  return renderHook(({ path }) => useApiGet<{ v: number }>(path), { initialProps: { path } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useApiGet", () => {
  it("loads, then has the data", async () => {
    const api = scriptedApi(["/a"]);
    const { result } = render();
    expect(result.current.status).toBe("loading");

    await api.answer("/a", 0, json({ v: 1 }));

    expect(result.current).toMatchObject({ status: "ready", data: { v: 1 } });
  });

  it("retry goes back to loading", async () => {
    const api = scriptedApi(["/a"]);
    const { result } = render();
    await api.answer("/a", 0, json({ v: 1 }));

    act(() => result.current.retry());

    expect(result.current.status).toBe("loading");
    await api.answer("/a", 1, json({ v: 2 }));
    expect(result.current).toMatchObject({ status: "ready", data: { v: 2 } });
  });

  it("refresh keeps the data on screen until the new answer arrives", async () => {
    const api = scriptedApi(["/a"]);
    const { result } = render();
    await api.answer("/a", 0, json({ v: 1 }));

    act(() => result.current.refresh());

    expect(result.current).toMatchObject({ status: "ready", data: { v: 1 } });
    await api.answer("/a", 1, json({ v: 2 }));
    expect(result.current).toMatchObject({ status: "ready", data: { v: 2 } });
  });

  it("the last refresh wins, whatever order the answers come in", async () => {
    const api = scriptedApi(["/a"]);
    const { result } = render();
    await api.answer("/a", 0, json({ v: 1 }));

    act(() => result.current.refresh());
    act(() => result.current.refresh());

    await api.answer("/a", 2, json({ v: 3 }));
    await api.answer("/a", 1, json({ v: 2 }));

    expect(result.current).toMatchObject({ status: "ready", data: { v: 3 } });
  });

  it("a late failure of an overtaken refresh changes nothing", async () => {
    const api = scriptedApi(["/a"]);
    const { result } = render();
    await api.answer("/a", 0, json({ v: 1 }));

    act(() => result.current.refresh());
    act(() => result.current.refresh());

    await api.answer("/a", 2, json({ v: 3 }));
    await api.answer("/a", 1, json({ message: "boom" }, 500));

    expect(result.current).toMatchObject({ status: "ready", data: { v: 3 } });
  });

  it("a failed refresh becomes an error, so old data can't look current", async () => {
    const api = scriptedApi(["/a"]);
    const { result } = render();
    await api.answer("/a", 0, json({ v: 1 }));

    act(() => result.current.refresh());
    await api.answer("/a", 1, json({ message: "boom" }, 500));

    expect(result.current.status).toBe("error");
    expect(result.current).not.toHaveProperty("data");
  });

  it("a new path reads as loading from its first render, not the old path's data", async () => {
    const api = scriptedApi(["/a", "/b"]);
    const { result, rerender } = render();
    await api.answer("/a", 0, json({ v: 1 }));

    rerender({ path: "/b" });

    expect(result.current.status).toBe("loading");
    await api.answer("/b", 0, json({ v: 2 }));
    expect(result.current).toMatchObject({ status: "ready", data: { v: 2 } });
  });

  it("a path change ignores a refresh still in flight for the old path", async () => {
    const api = scriptedApi(["/a", "/b"]);
    const { result, rerender } = render();
    await api.answer("/a", 0, json({ v: 1 }));

    act(() => result.current.refresh());
    rerender({ path: "/b" });
    await api.answer("/b", 0, json({ v: 2 }));
    await api.answer("/a", 1, json({ v: 99 }));

    expect(result.current).toMatchObject({ status: "ready", data: { v: 2 } });
  });

  it("a refresh and a path change together still load the new path", async () => {
    const api = scriptedApi(["/a", "/b"]);
    const { result, rerender } = render();
    await api.answer("/a", 0, json({ v: 1 }));

    act(() => {
      result.current.refresh();
    });
    rerender({ path: "/b" });

    expect(result.current.status).toBe("loading");
    await api.answer("/b", 0, json({ v: 2 }));
    expect(result.current).toMatchObject({ status: "ready", data: { v: 2 } });
  });
});
