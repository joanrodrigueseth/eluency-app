import React from "react";
import {
  Pressable as RNPressable,
  TouchableOpacity as RNTouchableOpacity,
  type PressableProps,
  type TouchableOpacityProps,
} from "react-native";

import { triggerLightImpact } from "./haptics";

type HapticTouchableOpacityProps = TouchableOpacityProps & {
  hapticsDisabled?: boolean;
};

type HapticPressableProps = PressableProps & {
  hapticsDisabled?: boolean;
};

export const TouchableOpacity = React.forwardRef<
  React.ComponentRef<typeof RNTouchableOpacity>,
  HapticTouchableOpacityProps
>(function HapticTouchableOpacity(
  { hapticsDisabled = false, onPressIn, disabled, ...props },
  ref
) {
  return (
    <RNTouchableOpacity
      {...props}
      ref={ref}
      disabled={disabled}
      onPressIn={(event) => {
        if (!disabled && !hapticsDisabled) {
          triggerLightImpact();
        }
        onPressIn?.(event);
      }}
    />
  );
});

export const Pressable = React.forwardRef<
  React.ComponentRef<typeof RNPressable>,
  HapticPressableProps
>(function HapticPressable(
  { hapticsDisabled = false, onPressIn, disabled, ...props },
  ref
) {
  return (
    <RNPressable
      {...props}
      ref={ref}
      disabled={disabled}
      onPressIn={(event) => {
        if (!disabled && !hapticsDisabled) {
          triggerLightImpact();
        }
        onPressIn?.(event);
      }}
    />
  );
});

TouchableOpacity.displayName = "TouchableOpacity";
Pressable.displayName = "Pressable";
