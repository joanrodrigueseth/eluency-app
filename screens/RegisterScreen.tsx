import { useMemo, useState, useRef } from "react";
import {
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  Switch,
  Text,
  TouchableOpacity,
  View,
  Modal,
  FlatList,
  TextInput,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Constants from "expo-constants";
import { Feather, Ionicons } from "@expo/vector-icons";

import AppButton from "../components/AppButton";
import AppTextField from "../components/AppTextField";
import GlassCard from "../components/GlassCard";
import { supabase } from "../lib/supabase";
import { useAppTheme } from "../lib/theme";

type RootStackParamList = {
  Login: { initialView?: "teacher" | "student" } | undefined;
  Register: undefined;
  Dashboard: undefined;
};

const LOGO_SRC = require("../assets/LogoBO.png");
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

  const goToDashboard = () => {
    navigation.reset({ index: 0, routes: [{ name: "Dashboard" }] });
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
            <Image source={LOGO_SRC} style={{ width: logoW, height: logoH }} resizeMode="contain" />
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
            if (step <= 1) setStep(0);
            else setStep(step - 1);
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
            onPress={() => handleCreateAccount('standard')} 
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
      onPress={() => handleCreateAccount('basic')}
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
