import * as React from "react";
import "./button.css";

export type ButtonVariant = "primary" | "secondary" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

/** Section 12.5. Un seul bouton `primary` par écran (section 12, préambule) —
 * ce n'est pas imposé par le composant lui-même, à respecter à l'usage. */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", className, children, ...props }, ref) => {
    const classes = ["hc-button", `hc-button--${variant}`, `hc-button--${size}`, className]
      .filter(Boolean)
      .join(" ");

    return (
      <button ref={ref} className={classes} data-variant={variant} data-size={size} {...props}>
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
