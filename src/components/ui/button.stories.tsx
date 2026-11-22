/**
 * Button story — SVC-489.
 *
 * Proves the Storybook preset resolves OKLCH tokens (brand blue on
 * `variant="default"`) and `.dark` class activation (toolbar toggle swaps
 * token values). Subsequent feel-upgrade waves extend this file with
 * new variants rather than scaffolding new story files per variant.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "@/components/ui/button";

const meta: Meta<typeof Button> = {
  title: "UI / Button",
  component: Button,
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "destructive", "outline", "secondary", "ghost", "link"],
    },
    size: {
      control: "select",
      options: ["default", "sm", "lg", "icon"],
    },
    disabled: { control: "boolean" },
  },
  args: {
    children: "Book · ₹1,200",
    variant: "default",
    size: "default",
  },
};

export default meta;
type Story = StoryObj<typeof Button>;

export const Primary: Story = {};

export const Secondary: Story = {
  args: { variant: "secondary", children: "Cancel" },
};

export const Destructive: Story = {
  args: { variant: "destructive", children: "Delete account" },
};

export const Outline: Story = {
  args: { variant: "outline", children: "Use saved address" },
};

export const Ghost: Story = {
  args: { variant: "ghost", children: "Ignore" },
};

export const Link: Story = {
  args: { variant: "link", children: "Forgot password?" },
};

export const Disabled: Story = {
  args: { disabled: true, children: "Saving…" },
};

export const Small: Story = {
  args: { size: "sm", children: "Edit" },
};

export const Large: Story = {
  args: { size: "lg", children: "Book now · ₹1,200" },
};
