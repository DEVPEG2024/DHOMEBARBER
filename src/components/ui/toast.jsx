import * as React from "react";
import { cva } from "class-variance-authority";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

// Copie sans Radix des toasts shadcn. Les conteneurs fixes couvrent toute la largeur du haut de l'écran
// même vides : ils doivent laisser passer les taps (pointer-events-none), sinon le haut des boutons
// d'en-tête ne répond plus sur mobile. Seuls les toasts eux-mêmes captent les taps (pointer-events-auto).
const ToastProvider = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "pointer-events-none fixed top-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4 pt-[calc(env(safe-area-inset-top)+12px)] sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px]",
      className
    )}
    {...props}
  />
));
ToastProvider.displayName = "ToastProvider";

const ToastViewport = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "pointer-events-none fixed top-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px]",
      className
    )}
    {...props}
  />
));
ToastViewport.displayName = "ToastViewport";

// Fermeture du toast courant, transmise à ToastClose (pas de Radix pour la fournir)
const ToastContext = React.createContext(null);

const toastVariants = cva(
  "group pointer-events-auto relative flex w-full items-center justify-between space-x-4 overflow-hidden rounded-md border p-6 pr-8 shadow-lg transition-all data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)] data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:transition-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[swipe=end]:animate-out data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-top-full data-[state=open]:sm:slide-in-from-bottom-full",
  {
    variants: {
      variant: {
        default: "border bg-background text-foreground",
        destructive:
          "destructive group border-destructive bg-destructive text-destructive-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

// `open` / `onOpenChange` viennent de use-toast : un toast fermé (croix ou minuterie) n'est plus rendu.
// `duration` est géré par use-toast ; on le retire ici pour ne pas le poser sur la div.
const Toast = React.forwardRef(({ className, variant, open = true, onOpenChange, duration, ...props }, ref) => {
  const close = React.useCallback(() => onOpenChange?.(false), [onOpenChange]);
  if (!open) return null;
  return (
    <ToastContext.Provider value={close}>
      <div
        ref={ref}
        role="status"
        data-state="open"
        className={cn(toastVariants({ variant }), className)}
        {...props}
      />
    </ToastContext.Provider>
  );
});
Toast.displayName = "Toast";

const ToastAction = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "inline-flex h-8 shrink-0 items-center justify-center rounded-md border bg-transparent px-3 text-sm font-medium ring-offset-background transition-colors hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 group-[.destructive]:border-muted/40 group-[.destructive]:hover:border-destructive/30 group-[.destructive]:hover:bg-destructive group-[.destructive]:hover:text-destructive-foreground group-[.destructive]:focus:ring-destructive",
      className
    )}
    {...props}
  />
));
ToastAction.displayName = "ToastAction";

// Toujours visible : pas de survol sur mobile
const ToastClose = React.forwardRef(({ className, onClick, ...props }, ref) => {
  const close = React.useContext(ToastContext);
  return (
    <button
      ref={ref}
      type="button"
      aria-label="Fermer"
      className={cn(
        "absolute right-2 top-2 rounded-md p-1 text-foreground/50 transition-colors hover:text-foreground focus:outline-none focus:ring-2 group-[.destructive]:text-red-300 group-[.destructive]:hover:text-red-50 group-[.destructive]:focus:ring-red-400 group-[.destructive]:focus:ring-offset-red-600",
        className
      )}
      toast-close=""
      onClick={(e) => {
        onClick?.(e);
        if (!e.defaultPrevented) close?.();
      }}
      {...props}
    >
      <X className="h-4 w-4" />
    </button>
  );
});
ToastClose.displayName = "ToastClose";

const ToastTitle = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm font-semibold", className)}
    {...props}
  />
));
ToastTitle.displayName = "ToastTitle";

const ToastDescription = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm opacity-90", className)}
    {...props}
  />
));
ToastDescription.displayName = "ToastDescription";

export {
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
}; 