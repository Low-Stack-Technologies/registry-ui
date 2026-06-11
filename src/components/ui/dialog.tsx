import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({ className, children, ...props }: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/45" />
      <DialogPrimitive.Content className={cn("fixed left-1/2 top-1/2 z-50 grid w-[min(92vw,520px)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border bg-background p-5 shadow-lg", className)} {...props}>
        {children}
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
export function DialogHeader(props: React.HTMLAttributes<HTMLDivElement>) {
  return <div className="flex flex-col gap-1.5 text-left" {...props} />;
}
export function DialogTitle(props: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className="text-lg font-semibold" {...props} />;
}
export function DialogDescription(props: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className="text-sm text-muted-foreground" {...props} />;
}
