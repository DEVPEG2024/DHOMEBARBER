import { Toaster as Sonner } from "sonner"
import { useTheme } from "@/lib/ThemeContext"

/**
 * Toaster sonner (utilisé par `toast` de "sonner" dans les pages).
 * Doit être monté une fois dans App.jsx, sinon aucun toast n'est affiché.
 */
const Toaster = ({
  ...props
}) => {
  const { theme = "dark" } = useTheme() || {}

  return (
    (<Sonner
      theme={theme}
      position="top-center"
      richColors
      closeButton
      duration={3500}
      // Sous la barre de statut / encoche sur iOS et Android
      offset="calc(env(safe-area-inset-top, 0px) + 12px)"
      mobileOffset="calc(env(safe-area-inset-top, 0px) + 12px)"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props} />)
  );
}

export { Toaster }
