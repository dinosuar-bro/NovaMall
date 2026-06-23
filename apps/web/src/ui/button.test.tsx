import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button } from "./button.js";

describe("Button", () => {
  it("loading 状态禁用按钮并保留可访问名称", () => {
    render(<Button loading>登录</Button>);
    const button = screen.getByRole("button", { name: "登录" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
  });
});
