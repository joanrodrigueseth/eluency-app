import {
  useMemo,
  useState,
  useRef } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  Switch,
  Text,
  View,
  Modal,
  FlatList,
  TextInput,
} from "react-native";
import { TouchableOpacity } from "../lib/hapticPressables";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Constants from "expo-constants";
import { Feather, Ionicons } from "@expo/vector-icons";
import { SvgXml } from "react-native-svg";
import type { User } from "@supabase/supabase-js";

import AppButton from "../components/AppButton";
import AppTextField from "../components/AppTextField";
import GlassCard from "../components/GlassCard";
import { signInWithSupabaseOAuth } from "../lib/oauth";
import { supabase } from "../lib/supabase";
import { useAppTheme } from "../lib/theme";

type RootStackParamList = {
  Login: { initialView?: "teacher" | "student" } | undefined;
  Register: undefined;
  Dashboard: undefined;
};

const LOGO_SRC = require("../assets/LogoBO.png");
const LOGO_DARK_XML = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1640" zoomAndPan="magnify" viewBox="0 0 1230 467.999983" height="624" preserveAspectRatio="xMidYMid meet" version="1.0"><defs><g/><clipPath id="81358943d2"><path d="M 0.839844 27 L 1027.078125 27 L 1027.078125 245 L 0.839844 245 Z M 0.839844 27 " clip-rule="nonzero"/></clipPath><clipPath id="4503a437f1"><rect x="0" width="1028" y="0" height="218"/></clipPath><clipPath id="626fddf5bb"><path d="M 337.71875 0.308594 L 426.523438 0.308594 L 426.523438 117.558594 L 337.71875 117.558594 Z M 337.71875 0.308594 " clip-rule="nonzero"/></clipPath><clipPath id="45e88c618b"><path d="M 396.46875 43.617188 L 396.46875 117.484375 L 367.78125 117.484375 L 367.78125 43.613281 L 337.71875 54.988281 L 382.121094 0.308594 L 426.523438 54.988281 Z M 396.46875 43.617188 " clip-rule="nonzero"/></clipPath><clipPath id="b2d141214c"><path d="M 0.71875 0.308594 L 89.523438 0.308594 L 89.523438 117.558594 L 0.71875 117.558594 Z M 0.71875 0.308594 " clip-rule="nonzero"/></clipPath><clipPath id="b4e470f895"><path d="M 59.46875 43.617188 L 59.46875 117.484375 L 30.78125 117.484375 L 30.78125 43.613281 L 0.71875 54.988281 L 45.121094 0.308594 L 89.523438 54.988281 Z M 59.46875 43.617188 " clip-rule="nonzero"/></clipPath><clipPath id="05a681e73c"><rect x="0" width="90" y="0" height="118"/></clipPath><clipPath id="e0372672ac"><path d="M 57 239 L 961 239 L 961 310.28125 L 57 310.28125 Z M 57 239 " clip-rule="nonzero"/></clipPath><clipPath id="477d1c2ee0"><rect x="0" width="904" y="0" height="72"/></clipPath><clipPath id="2a3a250323"><rect x="0" width="1028" y="0" height="311"/></clipPath></defs><g transform="matrix(1, 0, 0, 1, 111, 79)"><g clip-path="url(#2a3a250323)"><g clip-path="url(#81358943d2)"><g transform="matrix(1, 0, 0, 1, 0, 27)"><g clip-path="url(#4503a437f1)"><g fill="#ffffff" fill-opacity="1"><g transform="translate(1.723852, 172.619771)"><g><path d="M 111.421875 -23.171875 L 111.421875 0 L 14.796875 0 L 14.796875 -124.78125 L 109.09375 -124.78125 L 109.09375 -101.609375 L 43.5 -101.609375 L 43.5 -74.515625 L 101.4375 -74.515625 L 101.4375 -52.046875 L 43.5 -52.046875 L 43.5 -23.171875 Z M 111.421875 -23.171875 "/></g></g></g><g fill="#ffffff" fill-opacity="1"><g transform="translate(141.663387, 172.619771)"><g><path d="M 14.796875 -124.78125 L 43.671875 -124.78125 L 43.671875 -23.53125 L 106.25 -23.53125 L 106.25 0 L 14.796875 0 Z M 14.796875 -124.78125 "/></g></g></g><g fill="#ff751f" fill-opacity="1"><g transform="translate(269.661335, 172.619771)"><g><path d="M 70.234375 2.140625 C 52.410156 2.140625 38.535156 -2.789062 28.609375 -12.65625 C 18.679688 -22.519531 13.71875 -36.601562 13.71875 -54.90625 L 13.71875 -124.78125 L 42.609375 -124.78125 L 42.609375 -55.96875 C 42.609375 -33.632812 51.878906 -22.46875 70.421875 -22.46875 C 79.453125 -22.46875 86.34375 -25.171875 91.09375 -30.578125 C 95.84375 -35.984375 98.21875 -44.445312 98.21875 -55.96875 L 98.21875 -124.78125 L 126.75 -124.78125 L 126.75 -54.90625 C 126.75 -36.601562 121.785156 -22.519531 111.859375 -12.65625 C 101.929688 -2.789062 88.054688 2.140625 70.234375 2.140625 Z M 70.234375 2.140625 "/></g></g></g><g fill="#ff751f" fill-opacity="1"><g transform="translate(430.457955, 172.619771)"><g><path d="M 111.421875 -23.171875 L 111.421875 0 L 14.796875 0 L 14.796875 -124.78125 L 109.09375 -124.78125 L 109.09375 -101.609375 L 43.5 -101.609375 L 43.5 -74.515625 L 101.4375 -74.515625 L 101.4375 -52.046875 L 43.5 -52.046875 L 43.5 -23.171875 Z M 111.421875 -23.171875 "/></g></g></g><g fill="#ff751f" fill-opacity="1"><g transform="translate(570.39749, 172.619771)"><g><path d="M 129.25 -124.78125 L 129.25 0 L 105.53125 0 L 43.3125 -75.765625 L 43.3125 0 L 14.796875 0 L 14.796875 -124.78125 L 38.6875 -124.78125 L 100.71875 -49.015625 L 100.71875 -124.78125 Z M 129.25 -124.78125 "/></g></g></g><g fill="#ffffff" fill-opacity="1"><g transform="translate(734.766764, 172.619771)"><g><path d="M 74.515625 2.140625 C 61.796875 2.140625 50.296875 -0.617188 40.015625 -6.140625 C 29.734375 -11.671875 21.648438 -19.335938 15.765625 -29.140625 C 9.890625 -38.953125 6.953125 -50.035156 6.953125 -62.390625 C 6.953125 -74.753906 9.890625 -85.835938 15.765625 -95.640625 C 21.648438 -105.441406 29.734375 -113.101562 40.015625 -118.625 C 50.296875 -124.15625 61.851562 -126.921875 74.6875 -126.921875 C 85.507812 -126.921875 95.285156 -125.019531 104.015625 -121.21875 C 112.753906 -117.414062 120.09375 -111.945312 126.03125 -104.8125 L 107.5 -87.703125 C 99.0625 -97.453125 88.601562 -102.328125 76.125 -102.328125 C 68.394531 -102.328125 61.5 -100.628906 55.4375 -97.234375 C 49.375 -93.847656 44.648438 -89.125 41.265625 -83.0625 C 37.878906 -77.007812 36.1875 -70.117188 36.1875 -62.390625 C 36.1875 -54.671875 37.878906 -47.78125 41.265625 -41.71875 C 44.648438 -35.65625 49.375 -30.929688 55.4375 -27.546875 C 61.5 -24.160156 68.394531 -22.46875 76.125 -22.46875 C 88.601562 -22.46875 99.0625 -27.394531 107.5 -37.25 L 126.03125 -20.140625 C 120.09375 -12.890625 112.722656 -7.363281 103.921875 -3.5625 C 95.128906 0.238281 85.328125 2.140625 74.515625 2.140625 Z M 74.515625 2.140625 "/></g></g></g><g fill="#ffffff" fill-opacity="1"><g transform="translate(885.75877, 172.619771)"><g><path d="M 74.6875 -44.203125 L 74.6875 0 L 45.8125 0 L 45.8125 -44.5625 L -2.5 -124.78125 L 28.171875 -124.78125 L 61.5 -69.34375 L 94.84375 -124.78125 L 123.1875 -124.78125 Z M 74.6875 -44.203125 "/></g></g></g></g></g></g><g clip-path="url(#626fddf5bb)"><g clip-path="url(#45e88c618b)"><g transform="matrix(1, 0, 0, 1, 337, 0)"><g clip-path="url(#05a681e73c)"><g clip-path="url(#b2d141214c)"><g clip-path="url(#b4e470f895)"><path fill="#ff751f" d="M 89.523438 0.308594 L 89.523438 117.558594 L 0.71875 117.558594 L 0.71875 0.308594 Z M 89.523438 0.308594 " fill-opacity="1" fill-rule="nonzero"/></g></g></g></g></g></g><g clip-path="url(#e0372672ac)"><g transform="matrix(1, 0, 0, 1, 57, 239)"><g clip-path="url(#477d1c2ee0)"><g fill="#ffffff" fill-opacity="1"><g transform="translate(0.723803, 56.217803)"><g><path d="M 36.078125 -7.5 L 36.078125 0 L 4.796875 0 L 4.796875 -40.421875 L 35.328125 -40.421875 L 35.328125 -32.90625 L 14.09375 -32.90625 L 14.09375 -24.140625 L 32.84375 -24.140625 L 32.84375 -16.859375 L 14.09375 -16.859375 L 14.09375 -7.5 Z M 36.078125 -7.5 "/></g></g></g><g fill="#ffffff" fill-opacity="1"><g transform="translate(49.503485, 56.217803)"><g><path d="M 4.796875 -40.421875 L 14.140625 -40.421875 L 14.140625 -7.625 L 34.40625 -7.625 L 34.40625 0 L 4.796875 0 Z M 4.796875 -40.421875 "/></g></g></g><g fill="#ffffff" fill-opacity="1"><g transform="translate(94.415488, 56.217803)"><g><path d="M 36.078125 -7.5 L 36.078125 0 L 4.796875 0 L 4.796875 -40.421875 L 35.328125 -40.421875 L 35.328125 -32.90625 L 14.09375 -32.90625 L 14.09375 -24.140625 L 32.84375 -24.140625 L 32.84375 -16.859375 L 14.09375 -16.859375 L 14.09375 -7.5 Z M 36.078125 -7.5 "/></g></g></g><g fill="#ffffff" fill-opacity="1"><g transform="translate(143.19517, 56.217803)"><g><path d="M 43.640625 -40.421875 L 26.15625 0 L 16.921875 0 L -0.515625 -40.421875 L 9.578125 -40.421875 L 21.875 -11.546875 L 34.359375 -40.421875 Z M 43.640625 -40.421875 "/></g></g></g><g fill="#ffffff" fill-opacity="1"><g transform="translate(196.304323, 56.217803)"><g><path d="M 31.40625 -8.65625 L 12.640625 -8.65625 L 9.0625 0 L -0.515625 0 L 17.5 -40.421875 L 26.734375 -40.421875 L 44.796875 0 L 34.984375 0 Z M 28.46875 -15.765625 L 22.046875 -31.234375 L 15.640625 -15.765625 Z M 28.46875 -15.765625 "/></g></g></g><g fill="#ffffff" fill-opacity="1"><g transform="translate(250.568037, 56.217803)"><g><path d="M 13.15625 -32.796875 L 0.234375 -32.796875 L 0.234375 -40.421875 L 35.453125 -40.421875 L 35.453125 -32.796875 L 22.515625 -32.796875 L 22.515625 0 L 13.15625 0 Z M 13.15625 -32.796875 "/></g></g></g><g fill="#ffffff" fill-opacity="1"><g transform="translate(296.28821, 56.217803)"><g><path d="M 36.078125 -7.5 L 36.078125 0 L 4.796875 0 L 4.796875 -40.421875 L 35.328125 -40.421875 L 35.328125 -32.90625 L 14.09375 -32.90625 L 14.09375 -24.140625 L 32.84375 -24.140625 L 32.84375 -16.859375 L 14.09375 -16.859375 L 14.09375 -7.5 Z M 36.078125 -7.5 "/></g></g></g><g fill="#ffffff" fill-opacity="1"><g transform="translate(345.067892, 56.217803)"><g/></g></g><g fill="#ffffff" fill-opacity="1"><g transform="translate(371.44968, 56.217803)"><g><path d="M 13.15625 -32.796875 L 0.234375 -32.796875 L 0.234375 -40.421875 L 35.453125 -40.421875 L 35.453125 -32.796875 L 22.515625 -32.796875 L 22.515625 0 L 13.15625 0 Z M 13.15625 -32.796875 "/></g></g></g><g fill="#ffffff" fill-opacity="1"><g transform="translate(417.169876, 56.217803)"><g><path d="M 41.859375 -40.421875 L 41.859375 0 L 32.5 0 L 32.5 -16.5625 L 14.140625 -16.5625 L 14.140625 0 L 4.796875 0 L 4.796875 -40.421875 L 14.140625 -40.421875 L 14.140625 -24.484375 L 32.5 -24.484375 L 32.5 -40.421875 Z M 41.859375 -40.421875 "/></g></g></g><g fill="#ffffff" fill-opacity="1"><g transform="translate(473.858089, 56.217803)"><g><path d="M 36.078125 -7.5 L 36.078125 0 L 4.796875 0 L 4.796875 -40.421875 L 35.328125 -40.421875 L 35.328125 -32.90625 L 14.09375 -32.90625 L 14.09375 -24.140625 L 32.84375 -24.140625 L 32.84375 -16.859375 L 14.09375 -16.859375 L 14.09375 -7.5 Z M 36.078125 -7.5 "/></g></g></g><g fill="#ffffff" fill-opacity="1"><g transform="translate(522.637749, 56.217803)"><g/></g></g><g fill="#ffffff" fill-opacity="1"><g transform="translate(549.019537, 56.217803)"><g><path d="M 14.140625 -32.90625 L 14.140625 -22.234375 L 32.84375 -22.234375 L 32.84375 -14.71875 L 14.140625 -14.71875 L 14.140625 0 L 4.796875 0 L 4.796875 -40.421875 L 35.328125 -40.421875 L 35.328125 -32.90625 Z M 14.140625 -32.90625 "/></g></g></g><g fill="#ffffff" fill-opacity="1"><g transform="translate(595.951982, 56.217803)"><g><path d="M 4.796875 -40.421875 L 14.140625 -40.421875 L 14.140625 -7.625 L 34.40625 -7.625 L 34.40625 0 L 4.796875 0 Z M 4.796875 -40.421875 "/></g></g></g><g fill="#ffffff" fill-opacity="1"><g transform="translate(640.863996, 56.217803)"><g><path d="M 22.75 0.6875 C 16.976562 0.6875 12.484375 -0.90625 9.265625 -4.09375 C 6.054688 -7.289062 4.453125 -11.851562 4.453125 -17.78125 L 4.453125 -40.421875 L 13.796875 -40.421875 L 13.796875 -18.125 C 13.796875 -10.894531 16.800781 -7.28125 22.8125 -7.28125 C 25.726562 -7.28125 27.957031 -8.15625 29.5 -9.90625 C 31.039062 -11.65625 31.8125 -14.394531 31.8125 -18.125 L 31.8125 -40.421875 L 41.046875 -40.421875 L 41.046875 -17.78125 C 41.046875 -11.851562 39.4375 -7.289062 36.21875 -4.09375 C 33.007812 -0.90625 28.519531 0.6875 22.75 0.6875 Z M 22.75 0.6875 "/></g></g></g><g fill="#ffffff" fill-opacity="1"><g transform="translate(696.397684, 56.217803)"><g><path d="M 36.078125 -7.5 L 36.078125 0 L 4.796875 0 L 4.796875 -40.421875 L 35.328125 -40.421875 L 35.328125 -32.90625 L 14.09375 -32.90625 L 14.09375 -24.140625 L 32.84375 -24.140625 L 32.84375 -16.859375 L 14.09375 -16.859375 L 14.09375 -7.5 Z M 36.078125 -7.5 "/></g></g></g><g fill="#ffffff" fill-opacity="1"><g transform="translate(745.177343, 56.217803)"><g><path d="M 41.859375 -40.421875 L 41.859375 0 L 34.171875 0 L 14.03125 -24.53125 L 14.03125 0 L 4.796875 0 L 4.796875 -40.421875 L 12.53125 -40.421875 L 32.625 -15.875 L 32.625 -40.421875 Z M 41.859375 -40.421875 "/></g></g></g><g fill="#ffffff" fill-opacity="1"><g transform="translate(801.865556, 56.217803)"><g><path d="M 24.140625 0.6875 C 20.015625 0.6875 16.285156 -0.203125 12.953125 -1.984375 C 9.628906 -3.773438 7.015625 -6.257812 5.109375 -9.4375 C 3.203125 -12.613281 2.25 -16.203125 2.25 -20.203125 C 2.25 -24.210938 3.203125 -27.800781 5.109375 -30.96875 C 7.015625 -34.144531 9.628906 -36.628906 12.953125 -38.421875 C 16.285156 -40.210938 20.03125 -41.109375 24.1875 -41.109375 C 27.6875 -41.109375 30.851562 -40.488281 33.6875 -39.25 C 36.519531 -38.019531 38.894531 -36.253906 40.8125 -33.953125 L 34.8125 -28.40625 C 32.082031 -31.5625 28.695312 -33.140625 24.65625 -33.140625 C 22.15625 -33.140625 19.921875 -32.585938 17.953125 -31.484375 C 15.992188 -30.390625 14.460938 -28.859375 13.359375 -26.890625 C 12.265625 -24.929688 11.71875 -22.703125 11.71875 -20.203125 C 11.71875 -17.703125 12.265625 -15.46875 13.359375 -13.5 C 14.460938 -11.539062 15.992188 -10.015625 17.953125 -8.921875 C 19.921875 -7.828125 22.15625 -7.28125 24.65625 -7.28125 C 28.695312 -7.28125 32.082031 -8.875 34.8125 -12.0625 L 40.8125 -6.53125 C 38.894531 -4.175781 36.507812 -2.382812 33.65625 -1.15625 C 30.8125 0.0703125 27.640625 0.6875 24.140625 0.6875 Z M 24.140625 0.6875 "/></g></g></g><g fill="#ffffff" fill-opacity="1"><g transform="translate(854.224287, 56.217803)"><g><path d="M 24.1875 -14.3125 L 24.1875 0 L 14.84375 0 L 14.84375 -14.4375 L -0.8125 -40.421875 L 9.125 -40.421875 L 19.921875 -22.453125 L 30.71875 -40.421875 L 39.890625 -40.421875 Z M 24.1875 -14.3125 "/></g></g></g></g></g></g></g></g></svg>`;
const apiBaseUrl = Constants.expoConfig?.extra?.apiBaseUrl || "https://www.eluency.com";
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || "";
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";

type Option = { value: string; label: string };

/* ─── Language Options ─── */
type LanguageOption = { code: string; label: string };

const ALL_LANGUAGES: LanguageOption[] = [
  { code: "af", label: "Afrikaans" },
  { code: "sq", label: "Albanian" },
  { code: "am", label: "Amharic" },
  { code: "ar", label: "Arabic" },
  { code: "ar-EG", label: "Arabic (Egypt)" },
  { code: "ar-SA", label: "Arabic (Saudi Arabia)" },
  { code: "hy", label: "Armenian" },
  { code: "az", label: "Azerbaijani" },
  { code: "eu", label: "Basque" },
  { code: "be", label: "Belarusian" },
  { code: "bn", label: "Bengali" },
  { code: "bs", label: "Bosnian" },
  { code: "bg", label: "Bulgarian" },
  { code: "my", label: "Burmese" },
  { code: "ca", label: "Catalan" },
  { code: "ceb", label: "Cebuano" },
  { code: "zh-CN", label: "Chinese (Simplified)" },
  { code: "zh-TW", label: "Chinese (Traditional)" },
  { code: "hr", label: "Croatian" },
  { code: "cs", label: "Czech" },
  { code: "da", label: "Danish" },
  { code: "nl", label: "Dutch" },
  { code: "nl-BE", label: "Dutch (Belgium)" },
  { code: "en-US", label: "English (US)" },
  { code: "en-GB", label: "English (UK)" },
  { code: "en-AU", label: "English (Australia)" },
  { code: "en-CA", label: "English (Canada)" },
  { code: "en-IN", label: "English (India)" },
  { code: "en-ZA", label: "English (South Africa)" },
  { code: "eo", label: "Esperanto" },
  { code: "et", label: "Estonian" },
  { code: "fi", label: "Finnish" },
  { code: "fr-FR", label: "French (France)" },
  { code: "fr-CA", label: "French (Quebec)" },
  { code: "fr-BE", label: "French (Belgium)" },
  { code: "fr-CH", label: "French (Switzerland)" },
  { code: "gl", label: "Galician" },
  { code: "ka", label: "Georgian" },
  { code: "de-DE", label: "German (Germany)" },
  { code: "de-AT", label: "German (Austria)" },
  { code: "de-CH", label: "German (Switzerland)" },
  { code: "el", label: "Greek" },
  { code: "gu", label: "Gujarati" },
  { code: "ht", label: "Haitian Creole" },
  { code: "ha", label: "Hausa" },
  { code: "he", label: "Hebrew" },
  { code: "hi", label: "Hindi" },
  { code: "hu", label: "Hungarian" },
  { code: "is", label: "Icelandic" },
  { code: "ig", label: "Igbo" },
  { code: "id", label: "Indonesian" },
  { code: "ga", label: "Irish" },
  { code: "it", label: "Italian" },
  { code: "ja", label: "Japanese" },
  { code: "jv", label: "Javanese" },
  { code: "kn", label: "Kannada" },
  { code: "kk", label: "Kazakh" },
  { code: "km", label: "Khmer" },
  { code: "ko", label: "Korean" },
  { code: "ku", label: "Kurdish" },
  { code: "ky", label: "Kyrgyz" },
  { code: "lo", label: "Lao" },
  { code: "la", label: "Latin" },
  { code: "lv", label: "Latvian" },
  { code: "lt", label: "Lithuanian" },
  { code: "lb", label: "Luxembourgish" },
  { code: "mk", label: "Macedonian" },
  { code: "mg", label: "Malagasy" },
  { code: "ms", label: "Malay" },
  { code: "ml", label: "Malayalam" },
  { code: "mt", label: "Maltese" },
  { code: "mi", label: "Maori" },
  { code: "mr", label: "Marathi" },
  { code: "mn", label: "Mongolian" },
  { code: "ne", label: "Nepali" },
  { code: "no", label: "Norwegian" },
  { code: "ny", label: "Nyanja (Chichewa)" },
  { code: "or", label: "Odia" },
  { code: "ps", label: "Pashto" },
  { code: "fa", label: "Persian (Farsi)" },
  { code: "pl", label: "Polish" },
  { code: "pt-BR", label: "Portuguese (Brazil)" },
  { code: "pt-PT", label: "Portuguese (Portugal)" },
  { code: "pa", label: "Punjabi" },
  { code: "ro", label: "Romanian" },
  { code: "ru", label: "Russian" },
  { code: "sm", label: "Samoan" },
  { code: "gd", label: "Scottish Gaelic" },
  { code: "sr", label: "Serbian" },
  { code: "sn", label: "Shona" },
  { code: "sd", label: "Sindhi" },
  { code: "si", label: "Sinhala" },
  { code: "sk", label: "Slovak" },
  { code: "sl", label: "Slovenian" },
  { code: "so", label: "Somali" },
  { code: "es-ES", label: "Spanish (Spain)" },
  { code: "es-MX", label: "Spanish (Mexico)" },
  { code: "es-AR", label: "Spanish (Argentina)" },
  { code: "es-CO", label: "Spanish (Colombia)" },
  { code: "su", label: "Sundanese" },
  { code: "sw", label: "Swahili" },
  { code: "sv", label: "Swedish" },
  { code: "tl", label: "Tagalog (Filipino)" },
  { code: "tg", label: "Tajik" },
  { code: "ta", label: "Tamil" },
  { code: "tt", label: "Tatar" },
  { code: "te", label: "Telugu" },
  { code: "th", label: "Thai" },
  { code: "tr", label: "Turkish" },
  { code: "tk", label: "Turkmen" },
  { code: "uk", label: "Ukrainian" },
  { code: "ur", label: "Urdu" },
  { code: "ug", label: "Uyghur" },
  { code: "uz", label: "Uzbek" },
  { code: "vi", label: "Vietnamese" },
  { code: "cy", label: "Welsh" },
  { code: "xh", label: "Xhosa" },
  { code: "yi", label: "Yiddish" },
  { code: "yo", label: "Yoruba" },
  { code: "zu", label: "Zulu" },
];

/* ─── Country Options ─── */
type CountryOption = { code: string; name: string };

const ALL_COUNTRIES: CountryOption[] = [
  { code: "AF", name: "Afghanistan" },
  { code: "AL", name: "Albania" },
  { code: "DZ", name: "Algeria" },
  { code: "AS", name: "American Samoa" },
  { code: "AD", name: "Andorra" },
  { code: "AO", name: "Angola" },
  { code: "AI", name: "Anguilla" },
  { code: "AQ", name: "Antarctica" },
  { code: "AG", name: "Antigua and Barbuda" },
  { code: "AR", name: "Argentina" },
  { code: "AM", name: "Armenia" },
  { code: "AW", name: "Aruba" },
  { code: "AU", name: "Australia" },
  { code: "AT", name: "Austria" },
  { code: "AZ", name: "Azerbaijan" },
  { code: "BS", name: "Bahamas" },
  { code: "BH", name: "Bahrain" },
  { code: "BD", name: "Bangladesh" },
  { code: "BB", name: "Barbados" },
  { code: "BY", name: "Belarus" },
  { code: "BE", name: "Belgium" },
  { code: "BZ", name: "Belize" },
  { code: "BJ", name: "Benin" },
  { code: "BM", name: "Bermuda" },
  { code: "BT", name: "Bhutan" },
  { code: "BO", name: "Bolivia" },
  { code: "BA", name: "Bosnia and Herzegovina" },
  { code: "BW", name: "Botswana" },
  { code: "BR", name: "Brazil" },
  { code: "BN", name: "Brunei" },
  { code: "BG", name: "Bulgaria" },
  { code: "BF", name: "Burkina Faso" },
  { code: "BI", name: "Burundi" },
  { code: "CV", name: "Cabo Verde" },
  { code: "KH", name: "Cambodia" },
  { code: "CM", name: "Cameroon" },
  { code: "CA", name: "Canada" },
  { code: "KY", name: "Cayman Islands" },
  { code: "CF", name: "Central African Republic" },
  { code: "TD", name: "Chad" },
  { code: "CL", name: "Chile" },
  { code: "CN", name: "China" },
  { code: "CO", name: "Colombia" },
  { code: "KM", name: "Comoros" },
  { code: "CG", name: "Congo" },
  { code: "CD", name: "Congo (DRC)" },
  { code: "CK", name: "Cook Islands" },
  { code: "CR", name: "Costa Rica" },
  { code: "CI", name: "Côte d'Ivoire" },
  { code: "HR", name: "Croatia" },
  { code: "CU", name: "Cuba" },
  { code: "CW", name: "Curaçao" },
  { code: "CY", name: "Cyprus" },
  { code: "CZ", name: "Czech Republic" },
  { code: "DK", name: "Denmark" },
  { code: "DJ", name: "Djibouti" },
  { code: "DM", name: "Dominica" },
  { code: "DO", name: "Dominican Republic" },
  { code: "EC", name: "Ecuador" },
  { code: "EG", name: "Egypt" },
  { code: "SV", name: "El Salvador" },
  { code: "GQ", name: "Equatorial Guinea" },
  { code: "ER", name: "Eritrea" },
  { code: "EE", name: "Estonia" },
  { code: "SZ", name: "Eswatini" },
  { code: "ET", name: "Ethiopia" },
  { code: "FK", name: "Falkland Islands" },
  { code: "FO", name: "Faroe Islands" },
  { code: "FJ", name: "Fiji" },
  { code: "FI", name: "Finland" },
  { code: "FR", name: "France" },
  { code: "GF", name: "French Guiana" },
  { code: "PF", name: "French Polynesia" },
  { code: "GA", name: "Gabon" },
  { code: "GM", name: "Gambia" },
  { code: "GE", name: "Georgia" },
  { code: "DE", name: "Germany" },
  { code: "GH", name: "Ghana" },
  { code: "GI", name: "Gibraltar" },
  { code: "GR", name: "Greece" },
  { code: "GL", name: "Greenland" },
  { code: "GD", name: "Grenada" },
  { code: "GP", name: "Guadeloupe" },
  { code: "GU", name: "Guam" },
  { code: "GT", name: "Guatemala" },
  { code: "GG", name: "Guernsey" },
  { code: "GN", name: "Guinea" },
  { code: "GW", name: "Guinea-Bissau" },
  { code: "GY", name: "Guyana" },
  { code: "HT", name: "Haiti" },
  { code: "HN", name: "Honduras" },
  { code: "HK", name: "Hong Kong" },
  { code: "HU", name: "Hungary" },
  { code: "IS", name: "Iceland" },
  { code: "IN", name: "India" },
  { code: "ID", name: "Indonesia" },
  { code: "IR", name: "Iran" },
  { code: "IQ", name: "Iraq" },
  { code: "IE", name: "Ireland" },
  { code: "IM", name: "Isle of Man" },
  { code: "IL", name: "Israel" },
  { code: "IT", name: "Italy" },
  { code: "JM", name: "Jamaica" },
  { code: "JP", name: "Japan" },
  { code: "JE", name: "Jersey" },
  { code: "JO", name: "Jordan" },
  { code: "KZ", name: "Kazakhstan" },
  { code: "KE", name: "Kenya" },
  { code: "KI", name: "Kiribati" },
  { code: "KP", name: "Korea (North)" },
  { code: "KR", name: "Korea (South)" },
  { code: "XK", name: "Kosovo" },
  { code: "KW", name: "Kuwait" },
  { code: "KG", name: "Kyrgyzstan" },
  { code: "LA", name: "Laos" },
  { code: "LV", name: "Latvia" },
  { code: "LB", name: "Lebanon" },
  { code: "LS", name: "Lesotho" },
  { code: "LR", name: "Liberia" },
  { code: "LY", name: "Libya" },
  { code: "LI", name: "Liechtenstein" },
  { code: "LT", name: "Lithuania" },
  { code: "LU", name: "Luxembourg" },
  { code: "MO", name: "Macao" },
  { code: "MG", name: "Madagascar" },
  { code: "MW", name: "Malawi" },
  { code: "MY", name: "Malaysia" },
  { code: "MV", name: "Maldives" },
  { code: "ML", name: "Mali" },
  { code: "MT", name: "Malta" },
  { code: "MH", name: "Marshall Islands" },
  { code: "MQ", name: "Martinique" },
  { code: "MR", name: "Mauritania" },
  { code: "MU", name: "Mauritius" },
  { code: "YT", name: "Mayotte" },
  { code: "MX", name: "Mexico" },
  { code: "FM", name: "Micronesia" },
  { code: "MD", name: "Moldova" },
  { code: "MC", name: "Monaco" },
  { code: "MN", name: "Mongolia" },
  { code: "ME", name: "Montenegro" },
  { code: "MS", name: "Montserrat" },
  { code: "MA", name: "Morocco" },
  { code: "MZ", name: "Mozambique" },
  { code: "MM", name: "Myanmar" },
  { code: "NA", name: "Namibia" },
  { code: "NR", name: "Nauru" },
  { code: "NP", name: "Nepal" },
  { code: "NL", name: "Netherlands" },
  { code: "NC", name: "New Caledonia" },
  { code: "NZ", name: "New Zealand" },
  { code: "NI", name: "Nicaragua" },
  { code: "NE", name: "Niger" },
  { code: "NG", name: "Nigeria" },
  { code: "NU", name: "Niue" },
  { code: "NF", name: "Norfolk Island" },
  { code: "MK", name: "North Macedonia" },
  { code: "MP", name: "Northern Mariana Islands" },
  { code: "NO", name: "Norway" },
  { code: "OM", name: "Oman" },
  { code: "PK", name: "Pakistan" },
  { code: "PW", name: "Palau" },
  { code: "PS", name: "Palestine" },
  { code: "PA", name: "Panama" },
  { code: "PG", name: "Papua New Guinea" },
  { code: "PY", name: "Paraguay" },
  { code: "PE", name: "Peru" },
  { code: "PH", name: "Philippines" },
  { code: "PL", name: "Poland" },
  { code: "PT", name: "Portugal" },
  { code: "PR", name: "Puerto Rico" },
  { code: "QA", name: "Qatar" },
  { code: "RE", name: "Réunion" },
  { code: "RO", name: "Romania" },
  { code: "RU", name: "Russia" },
  { code: "RW", name: "Rwanda" },
  { code: "BL", name: "Saint Barthélemy" },
  { code: "SH", name: "Saint Helena" },
  { code: "KN", name: "Saint Kitts and Nevis" },
  { code: "LC", name: "Saint Lucia" },
  { code: "MF", name: "Saint Martin" },
  { code: "PM", name: "Saint Pierre and Miquelon" },
  { code: "VC", name: "Saint Vincent and the Grenadines" },
  { code: "WS", name: "Samoa" },
  { code: "SM", name: "San Marino" },
  { code: "ST", name: "São Tomé and Príncipe" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "SN", name: "Senegal" },
  { code: "RS", name: "Serbia" },
  { code: "SC", name: "Seychelles" },
  { code: "SL", name: "Sierra Leone" },
  { code: "SG", name: "Singapore" },
  { code: "SX", name: "Sint Maarten" },
  { code: "SK", name: "Slovakia" },
  { code: "SI", name: "Slovenia" },
  { code: "SB", name: "Solomon Islands" },
  { code: "SO", name: "Somalia" },
  { code: "ZA", name: "South Africa" },
  { code: "SS", name: "South Sudan" },
  { code: "ES", name: "Spain" },
  { code: "LK", name: "Sri Lanka" },
  { code: "SD", name: "Sudan" },
  { code: "SR", name: "Suriname" },
  { code: "SE", name: "Sweden" },
  { code: "CH", name: "Switzerland" },
  { code: "SY", name: "Syria" },
  { code: "TW", name: "Taiwan" },
  { code: "TJ", name: "Tajikistan" },
  { code: "TZ", name: "Tanzania" },
  { code: "TH", name: "Thailand" },
  { code: "TL", name: "Timor-Leste" },
  { code: "TG", name: "Togo" },
  { code: "TK", name: "Tokelau" },
  { code: "TO", name: "Tonga" },
  { code: "TT", name: "Trinidad and Tobago" },
  { code: "TN", name: "Tunisia" },
  { code: "TR", name: "Turkey" },
  { code: "TM", name: "Turkmenistan" },
  { code: "TC", name: "Turks and Caicos Islands" },
  { code: "TV", name: "Tuvalu" },
  { code: "UG", name: "Uganda" },
  { code: "UA", name: "Ukraine" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "GB", name: "United Kingdom" },
  { code: "US", name: "United States" },
  { code: "UY", name: "Uruguay" },
  { code: "UZ", name: "Uzbekistan" },
  { code: "VU", name: "Vanuatu" },
  { code: "VA", name: "Vatican City" },
  { code: "VE", name: "Venezuela" },
  { code: "VN", name: "Vietnam" },
  { code: "VG", name: "Virgin Islands (British)" },
  { code: "VI", name: "Virgin Islands (U.S.)" },
  { code: "WF", name: "Wallis and Futuna" },
  { code: "EH", name: "Western Sahara" },
  { code: "YE", name: "Yemen" },
  { code: "ZM", name: "Zambia" },
  { code: "ZW", name: "Zimbabwe" },
];

const countryOptions = ALL_COUNTRIES.map((c) => ({ value: c.code, label: c.name }));
const languageOptions = ALL_LANGUAGES.map((l) => ({ value: l.code, label: l.label }));

const PROFESSIONS: Option[] = [
  { value: "teacher", label: "Teacher" },
  { value: "tutor", label: "Tutor" },
  { value: "school", label: "School" },
];
const STUDENT_COUNTS: Option[] = [
  { value: "1-10", label: "1–10" },
  { value: "10-29", label: "11–29" },
  { value: "30-59", label: "30–59" },
  { value: "60+", label: "60+" },
];
const REFERRAL_SOURCES: Option[] = [
  { value: "search", label: "Search engine (Google, Bing, etc.)" },
  { value: "social", label: "Social media" },
  { value: "colleague", label: "Colleague or friend" },
  { value: "conference", label: "Conference or event" },
  { value: "ad", label: "Online advertisement" },
  { value: "blog", label: "Blog or article" },
  { value: "other", label: "Other" },
];

function guessTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}

function hasCompletedTeacherOnboarding(rawMetadata: unknown): boolean {
  if (!rawMetadata || typeof rawMetadata !== "object") return false;

  const metadata = rawMetadata as Record<string, unknown>;
  const hasLanguages =
    Array.isArray(metadata.teaching_languages) && metadata.teaching_languages.length > 0;

  return (
    metadata.role === "teacher" &&
    typeof metadata.profession === "string" &&
    metadata.profession.length > 0 &&
    typeof metadata.student_count === "string" &&
    metadata.student_count.length > 0 &&
    typeof metadata.plan === "string" &&
    metadata.plan.length > 0 &&
    hasLanguages
  );
}

function isExistingOAuthAccount(user: User): boolean {
  const createdAt = Date.parse(user.created_at ?? "");
  if (Number.isNaN(createdAt)) return true;

  // Fresh OAuth registrations are created moments before onboarding begins.
  return Date.now() - createdAt > 2 * 60 * 1000;
}

function ChoiceGroup({
  title,
  options,
  value,
  onChange,
}: {
  title: string;
  options: Option[];
  value: string;
  onChange: (v: string) => void;
}) {
  const theme = useAppTheme();
  return (
    <View style={{ gap: 8 }}>
      <Text style={theme.typography.label}>{title}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {options.map((o) => {
          const sel = o.value === value;
          return (
            <TouchableOpacity
              key={o.value}
              onPress={() => onChange(o.value)}
              activeOpacity={0.9}
              style={{
                flexGrow: 1,
                minWidth: 80,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: sel ? theme.colors.primary : theme.colors.border,
                backgroundColor: sel ? theme.colors.primarySoft : theme.colors.surfaceAlt,
                paddingHorizontal: 12,
                paddingVertical: 10,
              }}
            >
              <Text
                style={[
                  theme.typography.caption,
                  {
                    textAlign: "center",
                    fontWeight: "700",
                    color: sel ? theme.colors.primary : theme.colors.textMuted,
                  },
                ]}
              >
                {o.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function SearchableDropdown({
  value,
  onChange,
  options,
  label,
  placeholder,
  icon,
}: {
  value: string;
  onChange: (val: string) => void;
  options: Option[];
  label: string;
  placeholder?: string;
  icon?: React.ReactNode;
}) {
  const theme = useAppTheme();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selectedLabel = options.find((o) => o.value === value)?.label || (placeholder || "Select…");

  const filtered = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [search, options]);

  return (
    <View style={{ gap: 8 }}>
      <Text style={theme.typography.label}>{label}</Text>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        activeOpacity={0.9}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          borderRadius: 14,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surfaceAlt,
          paddingHorizontal: 12,
          paddingVertical: 10,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
          {icon && <View style={{ marginRight: 8 }}>{icon}</View>}
          <Text
            style={[
              theme.typography.body,
              { color: value ? theme.colors.text : theme.colors.textMuted, flex: 1 },
            ]}
            numberOfLines={1}
          >
            {selectedLabel}
          </Text>
        </View>
        <Ionicons name="chevron-down" size={18} color={theme.colors.textMuted} />
      </TouchableOpacity>

      <Modal visible={open} animationType="fade" transparent>
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <View
            style={{
              backgroundColor: theme.colors.background,
              borderRadius: 16,
              maxHeight: "70%",
              overflow: "hidden",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                padding: 16,
                borderBottomWidth: 1,
                borderBottomColor: theme.colors.border,
              }}
            >
              <Text style={[theme.typography.bodyStrong, { flex: 1 }]}>{label}</Text>
              <TouchableOpacity onPress={() => setOpen(false)} style={{ padding: 4 }}>
                <Ionicons name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>

            <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search…"
                style={{
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surface,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  fontSize: 16,
                  color: theme.colors.text,
                }}
                autoFocus
              />
            </View>

            <FlatList
              data={filtered}
              keyExtractor={(item) => item.value}
              renderItem={({ item }) => {
                const isSelected = item.value === value;
                return (
                  <TouchableOpacity
                    onPress={() => {
                      onChange(item.value);
                      setOpen(false);
                      setSearch("");
                    }}
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 12,
                      backgroundColor: isSelected ? theme.colors.primarySoft : "transparent",
                    }}
                  >
                    <Text
                      style={[
                        theme.typography.body,
                        {
                          color: isSelected ? theme.colors.primary : theme.colors.text,
                          fontWeight: isSelected ? "700" : "400",
                        },
                      ]}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              }}
              style={{ maxHeight: 300 }}
              showsVerticalScrollIndicator={false}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

function ProgressBar({ current, total }: { current: number; total: number }) {
  const theme = useAppTheme();
  return (
    <View style={{ flexDirection: "row", gap: 6, marginBottom: 24 }}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: 4,
            borderRadius: 999,
            backgroundColor: i < current ? theme.colors.primary : theme.colors.border,
          }}
        />
      ))}
    </View>
  );
}

function ErrorBanner({
  message,
  theme,
}: {
  message: string;
  theme: ReturnType<typeof useAppTheme>;
}) {
  return (
    <View
      style={{
        borderRadius: 14,
        borderWidth: 1,
        borderColor: theme.colors.danger,
        backgroundColor: theme.colors.dangerSoft,
        padding: 12,
      }}
    >
      <Text style={[theme.typography.caption, { color: theme.colors.danger }]}>{message}</Text>
    </View>
  );
}

function ConsentRow({
  value,
  onValueChange,
  label,
  linkLabel,
  linkUrl,
  theme,
}: {
  value: boolean;
  onValueChange: (v: boolean) => void;
  label: string;
  linkLabel?: string;
  linkUrl?: string;
  theme: ReturnType<typeof useAppTheme>;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Switch
        value={value}
        onValueChange={onValueChange}
        thumbColor={value ? theme.colors.primary : "#F8FAFC"}
        trackColor={{ false: "#CBD5E1", true: theme.colors.primarySoft }}
        style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
      />
      <Text style={{ flex: 1, fontSize: 12, lineHeight: 16, color: theme.colors.textMuted }}>
        {label}{" "}
        {linkLabel && linkUrl ? (
          <Text
            style={{ color: theme.colors.primary, textDecorationLine: "underline", fontWeight: "600" }}
            onPress={() => Linking.openURL(linkUrl).catch(() => {})}
          >
            {linkLabel}
          </Text>
        ) : null}
      </Text>
    </View>
  );
}

function PlanCard({
  name,
  price,
  description,
  highlight,
  badge,
  actionLabel,
  onSelect,
  theme,
  loading,
}: {
  name: string;
  price: string;
  description: string;
  highlight?: boolean;
  badge?: string;
  actionLabel: string;
  onSelect: () => void;
  theme: ReturnType<typeof useAppTheme>;
  loading?: boolean;
}) {
  return (
    <GlassCard
      style={{
        borderRadius: 16,
        borderWidth: highlight ? 2 : 1,
        borderColor: highlight ? theme.colors.primary : theme.colors.border,
        marginBottom: 12,
      }}
      padding={16}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 12,
        }}
      >
        <View style={{ flex: 1, paddingRight: 12, gap: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={theme.typography.bodyStrong}>{name}</Text>
            {badge ? (
              <View
                style={{
                  backgroundColor: theme.colors.primarySoft,
                  borderRadius: 999,
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                }}
              >
                <Text
                  style={[
                    theme.typography.caption,
                    { color: theme.colors.primary, fontWeight: "700" },
                  ]}
                >
                  {badge}
                </Text>
              </View>
            ) : null}
          </View>
          <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
            {description}
          </Text>
        </View>
        <Text style={[theme.typography.title, { fontSize: 18 }]}>{price}</Text>
      </View>
      <AppButton label={actionLabel} onPress={onSelect} variant={highlight ? "primary" : "secondary"} loading={loading} />
    </GlassCard>
  );
}

export default function RegisterScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [oauthLoading, setOauthLoading] = useState<"google" | "apple" | null>(null);
  const [isOAuthOnboarding, setIsOAuthOnboarding] = useState(false);
  const [showSchoolModal, setShowSchoolModal] = useState(false);

  // Step 1 — account
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Step 2 — profile
  const [profession, setProfession] = useState("teacher");
  const [studentCount, setStudentCount] = useState("1-10");
  const [countryCode, setCountryCode] = useState("CA");
  const [primaryLang, setPrimaryLang] = useState("en-US");
  const [teachingLang, setTeachingLang] = useState("en-US");
  const [referralSource, setReferralSource] = useState("");

  // Step 3 — consent
  const [consentTerms, setConsentTerms] = useState(false);
  const [consentSecurity, setConsentSecurity] = useState(false);

  const { width: screenWidth } = Dimensions.get("window");
  const logoW = Math.min(220, screenWidth - 96);
  const logoH = Math.round(logoW * (169 / 300));

  const selectedLanguages = useMemo(() => {
    const langs = [primaryLang];
    if (teachingLang !== primaryLang) langs.push(teachingLang);
    return langs;
  }, [primaryLang, teachingLang]);

  const advanceStep1 = () => {
    setError("");
    setIsOAuthOnboarding(false);
    const e = email.trim().toLowerCase();
    if (!fullName.trim()) { setError("Please enter your name."); return; }
    if (!e || !e.includes("@")) { setError("Please enter a valid email."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setStep(2);
  };

  const handleCreateAccount = async (plan: string) => {
    if (loading) return;
    setError("");
    setLoading(true);
    const timezone = guessTimezone();
    const cleanedEmail = email.trim().toLowerCase();
    const cleanedName = fullName.trim();
    try {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: cleanedEmail,
        password,
        options: {
          data: {
            role: "teacher",
            name: cleanedName,
            active: true,
            country_code: countryCode || undefined,
            timezone: timezone || undefined,
            profession,
            student_count: studentCount,
            referral_source: referralSource || undefined,
            plan,
            teaching_languages: selectedLanguages.map((code, i) => ({
              code,
              isPrimary: i === 0,
            })),
          },
        },
      });
      if (signUpError) throw signUpError;

      if (supabaseUrl && anonKey) {
        fetch(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/send-registration-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${anonKey}`,
          },
          body: JSON.stringify({ email: cleanedEmail, name: cleanedName }),
        }).catch((error) => {
          if (__DEV__) console.warn("send-registration-email failed", error);
        });
      }

      const session = signUpData.session;

      // If no session, Supabase requires email confirmation — don't attempt sign-in
      // (that would trigger an Invalid Refresh Token error on an unconfirmed account)
      if (!session) {
        navigation.reset({
          index: 0,
          routes: [{ name: "Login", params: { initialView: "teacher" } }],
        });
        return;
      }

      // Fire onboarding API — non-blocking, account is already created
      fetch(`${String(apiBaseUrl)}/api/onboarding/teacher/complete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          fullName: cleanedName,
          countryCode: countryCode || null,
          timezone: timezone || null,
          profession,
          studentCount,
          referralSource: referralSource || null,
          plan,
          teachingLanguages: selectedLanguages.map((code, i) => ({
            code,
            isPrimary: i === 0,
          })),
        }),
      }).catch((error) => {
        if (__DEV__) console.warn("teacher onboarding completion failed", error);
      });

      goToDashboard();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to create account");
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteOAuthOnboarding = async (plan: string) => {
    if (loading) return;
    setError("");
    setLoading(true);

    const timezone = guessTimezone();

    try {
      const [{ data: sessionData, error: sessionError }, { data: userData, error: userError }] =
        await Promise.all([supabase.auth.getSession(), supabase.auth.getUser()]);

      if (sessionError) throw sessionError;
      if (userError) throw userError;

      const session = sessionData.session;
      const user = userData.user;

      if (!session || !user) {
        throw new Error("Session expired. Please sign in again.");
      }

      const metadata =
        user.user_metadata && typeof user.user_metadata === "object"
          ? (user.user_metadata as Record<string, unknown>)
          : {};
      const cleanedEmail = (user.email ?? email).trim().toLowerCase();
      const cleanedName =
        fullName.trim() ||
        (typeof metadata.name === "string" ? metadata.name : "") ||
        (typeof metadata.full_name === "string" ? metadata.full_name : "") ||
        cleanedEmail.split("@")[0];

      const { error: updateUserError } = await supabase.auth.updateUser({
        data: {
          ...metadata,
          role: "teacher",
          name: cleanedName,
          active: true,
          country_code: countryCode || undefined,
          timezone: timezone || undefined,
          profession,
          student_count: studentCount,
          referral_source: referralSource || undefined,
          plan,
          teaching_languages: selectedLanguages.map((code, i) => ({
            code,
            isPrimary: i === 0,
          })),
        },
      });
      if (updateUserError) throw updateUserError;

      fetch(`${String(apiBaseUrl)}/api/onboarding/teacher/complete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          fullName: cleanedName,
          countryCode: countryCode || null,
          timezone: timezone || null,
          profession,
          studentCount,
          referralSource: referralSource || null,
          plan,
          teachingLanguages: selectedLanguages.map((code, i) => ({
            code,
            isPrimary: i === 0,
          })),
        }),
      }).catch((onboardingError) => {
        if (__DEV__) console.warn("teacher onboarding completion failed", onboardingError);
      });

      goToDashboard();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to finish onboarding.");
    } finally {
      setLoading(false);
    }
  };

  const goToDashboard = () => {
    navigation.reset({ index: 0, routes: [{ name: "Dashboard" }] });
  };

  const handleOAuthRegister = async (provider: "google" | "apple") => {
    if (provider === "apple" && Platform.OS !== "ios") {
      setError("Sign in with Apple is only available on iOS.");
      return;
    }

    setError("");
    setOauthLoading(provider);

    try {
      await signInWithSupabaseOAuth(provider);
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;

      const user = userData.user;
      if (!user) throw new Error("Unable to load account after sign in.");

      if (isExistingOAuthAccount(user) || hasCompletedTeacherOnboarding(user.user_metadata)) {
        await supabase.auth.signOut();
        Alert.alert(
          "Account already exists",
          "This Google account is already registered. Please sign in instead."
        );
        navigation.reset({
          index: 0,
          routes: [{ name: "Login", params: { initialView: "teacher" } }],
        });
        return;
      }

      const metadata =
        user.user_metadata && typeof user.user_metadata === "object"
          ? (user.user_metadata as Record<string, unknown>)
          : {};

      const prefilledEmail = (user.email ?? "").trim().toLowerCase();
      const prefilledName =
        (typeof metadata.name === "string" ? metadata.name : "") ||
        (typeof metadata.full_name === "string" ? metadata.full_name : "") ||
        (prefilledEmail ? prefilledEmail.split("@")[0] : "");

      if (prefilledEmail) setEmail(prefilledEmail);
      if (prefilledName) setFullName(prefilledName);

      setIsOAuthOnboarding(true);
      setStep(2);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to sign in with this provider.");
    } finally {
      setOauthLoading(null);
    }
  };

  const STEP_TITLES = ["", "Create your account", "Tell us about you", "Choose your plan"];
  const STEP_SUBTITLES = [
    "",
    "Enter your details to get started.",
    "Help us personalise your experience.",
    "Pick a plan that fits your classroom. You can always change this later.",
  ];

  // ── STEP 0: Landing ──────────────────────────────────────────────────────
  if (step === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        {/* Decorative blobs */}
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: -40,
            right: -60,
            width: 240,
            height: 240,
            borderRadius: 999,
            backgroundColor: theme.colors.primarySoft,
          }}
        />
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            bottom: 140,
            left: -50,
            width: 180,
            height: 180,
            borderRadius: 999,
            backgroundColor: theme.colors.violetSoft,
          }}
        />

        {/* Hero */}
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "flex-start",
            paddingHorizontal: 32,
            paddingTop: insets.top,
          }}
        >
          <View style={{ overflow: "visible" }}>
            {theme.isDark ? (
                <SvgXml xml={LOGO_DARK_XML} width={logoW} height={logoH} />
              ) : (
                <Image source={LOGO_SRC} style={{ width: logoW, height: logoH }} resizeMode="contain" />
              )}
          </View>
          <Text
            style={[
              theme.typography.display,
              { textAlign: "center", fontSize: 34, lineHeight: 32, marginTop: 1 },
            ]}
          >
            Teach smarter.
          </Text>
          <Text
            style={[
              theme.typography.body,
              {
                textAlign: "center",
                color: theme.colors.textMuted,
                marginTop: 12,
                lineHeight: 24,
              },
            ]}
          >
            Create lessons, manage students, and deliver an experience your students will love.
          </Text>
        </View>

        {/* Actions */}
        <View
          style={{
            paddingHorizontal: 24,
            paddingBottom: Math.max(insets.bottom + 20, 36),
            gap: 12,
          }}
        >
          <AppButton label="Create Account" onPress={() => setStep(1)} />

          <TouchableOpacity
            onPress={() => navigation.navigate("Login")}
            activeOpacity={0.8}
            style={{
              alignItems: "center",
              paddingVertical: 14,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surfaceAlt,
            }}
          >
            <Text style={[theme.typography.body, { color: theme.colors.text, fontWeight: "600" }]}>
              Already registered?{" "}
              <Text style={{ color: theme.colors.primary, fontWeight: "700" }}>Sign in</Text>
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => navigation.navigate("Login", { initialView: "student" })}
            activeOpacity={0.8}
            style={{ alignItems: "center", paddingVertical: 10 }}
          >
            <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
              Are you a student?{" "}
              <Text style={{ color: theme.colors.primary, fontWeight: "700" }}>Enter code here →</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── STEPS 1–4: Wizard ───────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Header */}
      <View
        style={{
          paddingTop: Math.max(insets.top, 12) + 8,
          paddingHorizontal: 20,
          paddingBottom: 4,
        }}
      >
        {/* Back / close */}
        <TouchableOpacity
          onPress={() => {
            setError("");
            if (step <= 1) {
              setIsOAuthOnboarding(false);
              setStep(0);
            } else {
              setStep(step - 1);
            }
          }}
          style={{ alignSelf: "flex-start", padding: 4, marginBottom: 18 }}
        >
          <Ionicons name="chevron-back" size={26} color={theme.colors.text} />
        </TouchableOpacity>

        <ProgressBar current={step} total={3} />

        <Text style={[theme.typography.label, { color: theme.colors.textMuted, marginBottom: 4 }]}>
          Step {step} of 3
        </Text>
        <Text style={[theme.typography.display, { fontSize: 26, lineHeight: 32 }]}>
          {STEP_TITLES[step]}
        </Text>
        <Text
          style={[
            theme.typography.body,
            { color: theme.colors.textMuted, marginTop: 6, marginBottom: 8 },
          ]}
        >
          {STEP_SUBTITLES[step]}
        </Text>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 4, gap: 16 }}
      >
        {/* ── Step 1: Account ── */}
        {step === 1 && (
          <>
            <AppTextField
              label="Full Name"
              placeholder="Your name"
              value={fullName}
              onChangeText={setFullName}
              icon={<Feather name="user" size={18} color={theme.colors.primary} />}
            />
            <AppTextField
              label="Email"
              placeholder="teacher@school.com"
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
              icon={<Feather name="mail" size={18} color={theme.colors.primary} />}
            />
            <AppTextField
              label="Password"
              placeholder="Minimum 8 characters"
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
              icon={<Feather name="lock" size={18} color={theme.colors.primary} />}
              rightElement={
                <TouchableOpacity onPress={() => setShowPassword((v) => !v)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Feather name={showPassword ? "eye-off" : "eye"} size={18} color={theme.colors.textMuted} />
                </TouchableOpacity>
              }
            />
            <AppTextField
              label="Confirm Password"
              placeholder="Repeat password"
              secureTextEntry={!showConfirm}
              value={confirm}
              onChangeText={setConfirm}
              icon={<Feather name="check-circle" size={18} color={theme.colors.primary} />}
              rightElement={
                <TouchableOpacity onPress={() => setShowConfirm((v) => !v)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Feather name={showConfirm ? "eye-off" : "eye"} size={18} color={theme.colors.textMuted} />
                </TouchableOpacity>
              }
            />
            {error ? <ErrorBanner message={error} theme={theme} /> : null}
            <AppButton label="Continue" onPress={advanceStep1} />

            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: theme.colors.border }} />
              <Text style={[theme.typography.caption, { color: theme.colors.textSoft }]}>or</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: theme.colors.border }} />
            </View>

            <TouchableOpacity
              onPress={() => handleOAuthRegister("google")}
              activeOpacity={0.85}
              disabled={!!oauthLoading}
              style={{
                borderRadius: 14,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surfaceAlt,
                paddingHorizontal: 14,
                paddingVertical: 12,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                opacity: oauthLoading ? 0.7 : 1,
              }}
            >
              {oauthLoading === "google" ? (
                <ActivityIndicator size="small" color={theme.colors.primary} />
              ) : (
                <Ionicons name="logo-google" size={18} color={theme.colors.primary} />
              )}
              <Text style={[theme.typography.body, { fontWeight: "700" }]}>Sign in by Gmail</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handleOAuthRegister("apple")}
              activeOpacity={0.85}
              disabled={!!oauthLoading}
              style={{
                borderRadius: 14,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surfaceAlt,
                paddingHorizontal: 14,
                paddingVertical: 12,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                opacity: oauthLoading ? 0.7 : 1,
              }}
            >
              {oauthLoading === "apple" ? (
                <ActivityIndicator size="small" color={theme.colors.primary} />
              ) : (
                <Ionicons name="logo-apple" size={18} color={theme.colors.text} />
              )}
              <Text style={[theme.typography.body, { fontWeight: "700" }]}>Sign in by Apple</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── Step 2: Profile ── */}
        {step === 2 && (
          <>
            <ChoiceGroup
              title="I am a…"
              options={PROFESSIONS}
              value={profession}
              onChange={setProfession}
            />
            <ChoiceGroup
              title="How many students?"
              options={STUDENT_COUNTS}
              value={studentCount}
              onChange={setStudentCount}
            />
            <SearchableDropdown
              value={countryCode}
              onChange={setCountryCode}
              options={countryOptions}
              label="Country"
              placeholder="Search countries…"
              icon={<Feather name="globe" size={18} color={theme.colors.primary} />}
            />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <SearchableDropdown
                  value={primaryLang}
                  onChange={setPrimaryLang}
                  options={languageOptions}
                  label="Primary Language"
                  placeholder="Search languages…"
                  icon={<Feather name="type" size={18} color={theme.colors.primary} />}
                />
              </View>
              <View style={{ flex: 1 }}>
                <SearchableDropdown
                  value={teachingLang}
                  onChange={setTeachingLang}
                  options={languageOptions}
                  label="Teaching Language"
                  placeholder="Search languages…"
                  icon={<Feather name="type" size={18} color={theme.colors.primary} />}
                />
              </View>
            </View>
            <SearchableDropdown
              value={referralSource}
              onChange={setReferralSource}
              options={REFERRAL_SOURCES}
              label="How did you hear about us?"
              placeholder="Select…"
              icon={<Feather name="message-square" size={18} color={theme.colors.primary} />}
            />

            <GlassCard style={{ borderRadius: 14 }} padding={10}>
              <View style={{ gap: 6 }}>
                <ConsentRow
                  value={consentTerms}
                  onValueChange={setConsentTerms}
                  label="I agree to the"
                  linkLabel="Terms and Conditions."
                  linkUrl="https://www.eluency.com/terms"
                  theme={theme}
                />
                <View style={{ height: 1, backgroundColor: theme.colors.border }} />
                <ConsentRow
                  value={consentSecurity}
                  onValueChange={setConsentSecurity}
                  label="I agree to the"
                  linkLabel="Privacy & Security Policy."
                  linkUrl="https://www.eluency.com/privacy"
                  theme={theme}
                />
              </View>
            </GlassCard>

            {error ? <ErrorBanner message={error} theme={theme} /> : null}

            <AppButton
              label="Continue"
              onPress={() => {
                setError("");
                if (!consentTerms) {
                  setError("You must agree to the Terms and Conditions.");
                  return;
                }
                if (!consentSecurity) {
                  setError("You must agree to the Privacy & Security Policy.");
                  return;
                }
                setStep(3);
              }}
            />
          </>
        )}

{/* ── Step 3: Subscription ── */}
{step === 3 && (
  <>
    {error ? <ErrorBanner message={error} theme={theme} /> : null}

    {/* Featured Plan: Standard with 14-Day Trial */}
    <GlassCard 
      style={{ 
        borderRadius: 20, 
        borderWidth: 2, 
        borderColor: theme.colors.primary,
        shadowColor: theme.colors.primary,
        shadowOpacity: 0.1,
        shadowRadius: 10
      }} 
      padding={21}
    >
      <View style={{ gap: 14 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ gap: 4 }}>
            <Text style={[theme.typography.caption, { color: theme.colors.primary, fontWeight: '700', letterSpacing: 1 }]}>RECOMMENDED</Text>
            <Text style={[theme.typography.title, { fontSize: 28 }]}>Standard</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[theme.typography.title, { fontSize: 28 }]}>$14.99</Text>
            <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>per month</Text>
          </View>
        </View>

        {/* Risk Reversal Banner */}
        <View style={{ backgroundColor: theme.colors.primarySoft, padding: 12, borderRadius: 12, borderLeftWidth: 4, borderLeftColor: theme.colors.primary }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={[theme.typography.bodyStrong, { color: theme.colors.primary, fontSize: 14 }]}>
              ✨ 14-Day Free Trial
            </Text>
            <Text style={[theme.typography.bodyStrong, { color: theme.colors.primary, fontSize: 14 }]}>
              $0 due today
            </Text>
          </View>
          <Text style={[theme.typography.caption, { color: theme.colors.primary, marginTop: 4 }]}>
            Cancel anytime before your trial ends.
          </Text>
        </View>

        <Text style={[theme.typography.body, { color: theme.colors.textMuted }]}>
          The complete toolkit for independent teachers and classroom educators.
        </Text>

        {/* Condensed Feature Highlights */}
        <View style={{ gap: 9, marginVertical: 2 }}>
          {[
            "Up to 30 Students included",
            "Access to 1,000+ Lessons & AI Tools",
            "Full Teacher & Student App Access",
            "Instant Feedback & Grade Tracking"
          ].map((feature, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Feather name="check" size={18} color="#10b981" strokeWidth={3} />
              <Text style={theme.typography.body}>{feature}</Text>
            </View>
          ))}
        </View>

        <View style={{ gap: 3, marginTop: 10 }}>
          <AppButton 
            label="Start My 14-Day Free Trial" 
            onPress={() => (isOAuthOnboarding ? handleCompleteOAuthOnboarding("standard") : handleCreateAccount("standard"))} 
            loading={loading} 
          />
          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
            <Feather name="lock" size={12} color={theme.colors.textMuted} />
            <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
              Secure checkout via Stripe
            </Text>
          </View>
        </View>

{/* Secondary Plans: Basic and School - Condensed */}
<View style={{ paddingVertical: 1, marginTop: 1 }}>
  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
    <View style={{ flex: 1, height: 1, backgroundColor: theme.colors.border }} />
    <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginHorizontal: 12, fontWeight: '600' }]}>OR</Text>
    <View style={{ flex: 1, height: 1, backgroundColor: theme.colors.border }} />
  </View>

  <View style={{ flexDirection: 'row', gap: 8 }}>
    {/* School Plan */}
    <TouchableOpacity 
      onPress={() => setShowSchoolModal(true)}
      activeOpacity={0.6}
      style={{ 
        flex: 1, 
        padding: 10, 
        borderRadius: 12, 
        backgroundColor: theme.colors.background, 
        borderWidth: 2, 
        borderColor: '#8b5cf6',
        justifyContent: 'center'
      }}
    >
      <Text 
        numberOfLines={1} 
        adjustsFontSizeToFit 
        style={[theme.typography.caption, { fontWeight: '700', fontSize: 13, color: '#000' }]}
      >
        Schools/Organization
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
        <Text 
          numberOfLines={1} 
          adjustsFontSizeToFit
          style={{ color: theme.colors.textMuted, fontSize: 10.5, flexShrink: 1 }}
        >
          Click for more info
        </Text>
        <Feather name="chevron-right" size={12} color={theme.colors.primary} style={{ marginLeft: 2 }} />
      </View>
    </TouchableOpacity>

    {/* Basic Plan */}
    <TouchableOpacity 
      onPress={() => (isOAuthOnboarding ? handleCompleteOAuthOnboarding("basic") : handleCreateAccount("basic"))}
      activeOpacity={0.6}
      style={{ 
        flex: 1, 
        padding: 10, 
        borderRadius: 12, 
        backgroundColor: theme.colors.background, 
        borderWidth: 2, 
        borderColor: '#10b981',
        justifyContent: 'center'
      }}
    >
      <Text 
        numberOfLines={1} 
        adjustsFontSizeToFit 
        style={[theme.typography.caption, { fontWeight: '700', fontSize: 13, color: theme.colors.text }]}
      >
        Start with Basic
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
        {/* We use a nested text component to keep the full "1 Student" wording together */}
        <Text 
          numberOfLines={1} 
          adjustsFontSizeToFit 
          minimumFontScale={0.8}
          style={{ fontSize: 10.5, flexShrink: 1 }}
        >
          <Text style={{ color: theme.colors.primary, fontWeight: '600' }}>$0/mo </Text>
          <Text style={{ color: theme.colors.textMuted }}>| 1 Student</Text>
        </Text>
        <Feather name="chevron-right" size={12} color={theme.colors.primary} style={{ marginLeft: 2 }} />
      </View>
    </TouchableOpacity>
  </View>
</View>
      </View>
    </GlassCard>

    {/* School Modal */}
    <Modal visible={showSchoolModal} animationType="fade" transparent>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 }}>
        <View style={{ backgroundColor: theme.colors.background, borderRadius: 16, padding: 20, maxHeight: '80%' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <Text style={theme.typography.title}>School & Organizations</Text>
            <TouchableOpacity onPress={() => setShowSchoolModal(false)} style={{ padding: 4 }}>
              <Ionicons name="close" size={24} color={theme.colors.text} />
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={[theme.typography.body, { marginBottom: 16 }]}>
              Designed for educational institutions looking for comprehensive language solutions.
            </Text>
            <Text style={theme.typography.bodyStrong}>Key Features:</Text>
            <View style={{ gap: 8, marginVertical: 12 }}>
              {["Unlimited Students", "Multiple Teacher Accounts", "Advanced Analytics", "Priority Support", "Bulk Management"].map((f, i) => (
                <Text key={i} style={theme.typography.caption}>• {f}</Text>
              ))}
            </View>
            <AppButton
              label="Contact for Quote"
              onPress={async () => {
                const mailto = "mailto:nathan@eluency.com?subject=School%20Plan%20Quote";
                const ok = await Linking.canOpenURL(mailto);
                if (ok) await Linking.openURL(mailto);
                setShowSchoolModal(false);
              }}
            />
          </ScrollView>
        </View>
      </View>
    </Modal>
  </>
)}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

