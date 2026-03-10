declare module 'react-native-config' {
  interface NativeConfig {
    GOOGLE_WEB_CLIENT_ID?: string;
  }
  const Config: NativeConfig;
  export default Config;
}
