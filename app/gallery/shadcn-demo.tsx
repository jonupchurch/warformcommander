"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";

/**
 * Stock shadcn overlays, themed ONLY by the re-pointed base tokens (no per-component color
 * override) — the SC-007 proof. The e2e spec opens these and checks the popover surface + focus
 * trap / Escape-close.
 */
export function ShadcnDemo() {
  return (
    <div className="flex flex-wrap gap-4">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" data-testid="menu-trigger">
            Open Menu
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent data-testid="menu-content">
          <DropdownMenuLabel>Squad</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem>Set as Active</DropdownMenuItem>
          <DropdownMenuItem>Duplicate</DropdownMenuItem>
          <DropdownMenuItem>Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog>
        <DialogTrigger asChild>
          <Button variant="secondary" data-testid="dialog-trigger">
            Open Dialog
          </Button>
        </DialogTrigger>
        <DialogContent data-testid="dialog-content">
          <DialogHeader>
            <DialogTitle>Confirm Deployment</DialogTitle>
            <DialogDescription>
              This resolves a best-of-three on the server. The result is final.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button>Deploy</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
