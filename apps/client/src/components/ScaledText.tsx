import { Children, forwardRef, useContext, type ComponentRef, type ReactNode } from "react";
import {
  Text as NativeText,
  TextInput as NativeTextInput,
  type TextInputProps,
  type TextProps,
} from "react-native";

import { LanguageContext, translate } from "@/i18n";

const MAX_FONT_SIZE_MULTIPLIER = 1.4;

function translateTextChild(value: string, language: "zh" | "en"): string {
  if (value.trim().length === 0) return value;
  const leading = value.match(/^\s*/)?.[0] ?? "";
  const trailing = value.match(/\s*$/)?.[0] ?? "";
  const content = value.slice(leading.length, value.length - trailing.length);
  return `${leading}${translate(content, language)}${trailing}`;
}

export const Text = forwardRef<ComponentRef<typeof NativeText>, TextProps>(function ScaledText(
  { accessibilityLabel, accessibilityRole, children, maxFontSizeMultiplier = MAX_FONT_SIZE_MULTIPLIER, role, ...props },
  ref,
) {
  const language = useContext(LanguageContext);
  const translatedChildren = Children.map(children as ReactNode, (child) =>
    typeof child === "string" ? translateTextChild(child, language) : child,
  );
  return (
    <NativeText
      {...props}
      accessibilityLabel={accessibilityLabel ? translate(accessibilityLabel, language) : undefined}
      accessibilityRole={accessibilityRole}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      ref={ref}
      role={role ?? (accessibilityRole === "header" ? "heading" : undefined)}
    >
      {translatedChildren}
    </NativeText>
  );
});

export const TextInput = forwardRef<ComponentRef<typeof NativeTextInput>, TextInputProps>(function ScaledTextInput(
  { accessibilityLabel, maxFontSizeMultiplier = MAX_FONT_SIZE_MULTIPLIER, placeholder, ...props },
  ref,
) {
  const language = useContext(LanguageContext);
  return (
    <NativeTextInput
      {...props}
      accessibilityLabel={accessibilityLabel ? translate(accessibilityLabel, language) : undefined}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      placeholder={placeholder ? translate(placeholder, language) : undefined}
      ref={ref}
    />
  );
});
