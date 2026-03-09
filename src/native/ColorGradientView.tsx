import React, { useEffect, useRef } from 'react';
import { DeviceEventEmitter, requireNativeComponent, StyleProp, ViewStyle } from 'react-native';

interface NativeProps {
  hue: number;
  sat: number;
  brightness: number;
  style?: StyleProp<ViewStyle>;
}

interface Props extends NativeProps {
  onSVChange:  (sat: number, val: number) => void;
  onHueChange: (hue: number) => void;
}

const NativeColorGradientView = requireNativeComponent<NativeProps>('ColorGradientView');

type Pending = { sat?: number; val?: number; hue?: number };

export default function ColorGradientView({ onSVChange, onHueChange, ...rest }: Props) {
  const svRef  = useRef(onSVChange);
  const hueRef = useRef(onHueChange);
  svRef.current  = onSVChange;
  hueRef.current = onHueChange;

  const latestRef = useRef<Pending | null>(null);
  const busyRef   = useRef(false);

  const flush = useRef<() => void>(() => {});
  flush.current = () => {
    const p = latestRef.current;
    if (!p) { busyRef.current = false; return; }
    latestRef.current = null;
    if (p.hue !== undefined) hueRef.current(p.hue);
    if (p.sat !== undefined && p.val !== undefined) svRef.current(p.sat, p.val);
    // After React processes this update, check for newer values
    setTimeout(() => flush.current(), 0);
  };

  useEffect(() => {
    const s1 = DeviceEventEmitter.addListener(
      'colorPickerSVChange',
      ({ sat, val }: { sat: number; val: number }) => {
        latestRef.current = { ...(latestRef.current ?? {}), sat, val };
        if (!busyRef.current) { busyRef.current = true; flush.current(); }
      },
    );
    const s2 = DeviceEventEmitter.addListener(
      'colorPickerHueChange',
      ({ hue }: { hue: number }) => {
        latestRef.current = { ...(latestRef.current ?? {}), hue };
        if (!busyRef.current) { busyRef.current = true; flush.current(); }
      },
    );
    return () => { s1.remove(); s2.remove(); };
  }, []);

  return <NativeColorGradientView {...rest} />;
}
