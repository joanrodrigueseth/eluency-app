import { Image } from "expo-image";
import type { ImageStyle, StyleProp } from "react-native";

type Props = {
  uri: string;
  style?: StyleProp<ImageStyle>;
  resizeMode?: "cover" | "contain" | "stretch" | "center";
};

/** Remote lesson/test images: skip cache so updated images load after catalog refresh. */
export default function RemoteLessonImage({ uri, style, resizeMode = "cover" }: Props) {
  const u = uri.trim();
  if (!u) return null;
  const contentFit = resizeMode === "contain" ? "contain" : "cover";
  return (
    <Image source={{ uri: u }} style={style} contentFit={contentFit} cachePolicy="none" transition={120} recyclingKey={u} />
  );
}
