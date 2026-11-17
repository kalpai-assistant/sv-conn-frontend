/**
 * The soft-keyboard signal the BottomNav hides on (SVC-412 device pass).
 *
 * jsdom has no `visualViewport`, so each test installs a fake one whose
 * height it moves the way Android moves it when the keyboard opens and closes.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { isEditable, useSoftKeyboardOpen } from "@/hooks/useSoftKeyboardOpen";

class FakeViewport extends EventTarget {
  height = 684;
  resize(height: number) {
    this.height = height;
    this.dispatchEvent(new Event("resize"));
  }
}

let vv: FakeViewport;
const field = () => document.querySelector<HTMLInputElement>("#price")!;

function install(viewport: FakeViewport | undefined) {
  Object.defineProperty(window, "visualViewport", { value: viewport, configurable: true });
}

beforeEach(() => {
  document.body.innerHTML = `
    <input id="price" type="text" />
    <input id="agree" type="checkbox" />
    <button id="save">Save</button>`;
  vv = new FakeViewport();
  install(vv);
});

afterEach(() => {
  install(undefined);
  document.body.innerHTML = "";
});

/** Focus, then the keyboard shrinks the viewport, as on the phone. */
function openKeyboard() {
  act(() => {
    field().focus();
    vv.resize(404);
  });
}

describe("useSoftKeyboardOpen", () => {
  it("is true while a text field has focus and the keyboard has shrunk the viewport", () => {
    const { result } = renderHook(() => useSoftKeyboardOpen());
    expect(result.current).toBe(false);
    openKeyboard();
    expect(result.current).toBe(true);
  });

  it("turns false on blur, once the keyboard has gone", async () => {
    const { result } = renderHook(() => useSoftKeyboardOpen());
    openKeyboard();
    await act(async () => {
      field().blur();
      vv.resize(684);
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(result.current).toBe(false);
  });

  it("turns false when the back button closes the keyboard and focus stays", () => {
    const { result } = renderHook(() => useSoftKeyboardOpen());
    openKeyboard();
    act(() => vv.resize(684));
    expect(document.activeElement).toBe(field());
    expect(result.current).toBe(false);
  });

  it("ignores a shrink with nothing editable focused", () => {
    const { result } = renderHook(() => useSoftKeyboardOpen());
    act(() => {
      document.querySelector<HTMLButtonElement>("#save")!.focus();
      vv.resize(404);
    });
    expect(result.current).toBe(false);
  });

  it("ignores focus that doesn't shrink the viewport (a desktop browser)", () => {
    const { result } = renderHook(() => useSoftKeyboardOpen());
    act(() => {
      field().focus();
      vv.resize(624); // a collapsing toolbar, not a keyboard
    });
    expect(result.current).toBe(false);
  });

  it("never hides without visualViewport", () => {
    install(undefined);
    const { result } = renderHook(() => useSoftKeyboardOpen());
    act(() => field().focus());
    expect(result.current).toBe(false);
  });
});

describe("isEditable", () => {
  it("counts fields that raise a keyboard, and nothing else", () => {
    expect(isEditable(field())).toBe(true);
    expect(isEditable(document.querySelector("#agree"))).toBe(false);
    expect(isEditable(document.querySelector("#save"))).toBe(false);
    field().readOnly = true;
    expect(isEditable(field())).toBe(false);
    expect(isEditable(null)).toBe(false);
  });
});
