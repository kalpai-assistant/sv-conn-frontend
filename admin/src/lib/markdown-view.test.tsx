import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { MarkdownView } from "./markdown-view";

describe("MarkdownView", () => {
  it("renders nothing for an empty or blank description", () => {
    expect(render(<MarkdownView source="" />).container.innerHTML).toBe("");
    expect(render(<MarkdownView source={"  \n "} />).container.innerHTML).toBe("");
  });

  it("renders lists, nested lists and a start number", () => {
    const { container } = render(<MarkdownView source={"- a\n  - b\n\n3. c\n4. d"} />);
    expect(container.querySelectorAll("ul > li")).toHaveLength(2);
    expect(container.querySelector("ul ul > li")?.textContent).toBe("b");
    expect(container.querySelector("ol")?.getAttribute("start")).toBe("3");
    expect(container.querySelectorAll("ol > li")).toHaveLength(2);
  });

  it("puts a tight item's text straight in the <li>, and a loose one's in a <p>", () => {
    const tight = render(<MarkdownView source={"- a\n- b"} />).container;
    expect(tight.querySelector("li > p")).toBeNull();
    const loose = render(<MarkdownView source={"- a\n\n- b"} />).container;
    expect(loose.querySelectorAll("li > p")).toHaveLength(2);
  });

  it("renders bold, italic and a line break", () => {
    const { container } = render(<MarkdownView source={"**B** *i*  \nnext"} />);
    expect(container.querySelector("strong")?.textContent).toBe("B");
    expect(container.querySelector("em")?.textContent).toBe("i");
    expect(container.querySelector("br")).not.toBeNull();
  });

  it("shows a script tag as text and creates no element from it", () => {
    const { container } = render(<MarkdownView source={"<script>alert(1)</script> <b>x</b>"} />);
    expect(container.querySelector("script, b")).toBeNull();
    expect(container.textContent).toBe("<script>alert(1)</script> <b>x</b>");
  });

  it("makes no link, heading, image or code element", () => {
    const { container } = render(
      <MarkdownView source={"# h\n\n[a](https://x.com) ![i](x.png) `c`"} />,
    );
    expect(container.querySelector("a, h1, img, code")).toBeNull();
  });
});
