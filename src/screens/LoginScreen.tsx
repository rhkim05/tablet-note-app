import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { GoogleSignin, GoogleSigninButton } from '@react-native-google-signin/google-signin';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import Config from 'react-native-config';
import { useAuthStore } from '../store/useAuthStore';

GoogleSignin.configure({ webClientId: Config.GOOGLE_WEB_CLIENT_ID ?? '' });

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export default function LoginScreen({ navigation }: Props) {
  const { user, setUser } = useAuthStore();
  const [loading, setLoading] = useState(false);

  // Already logged in — skip to Home
  useEffect(() => {
    if (user) {
      navigation.replace('Home');
    }
  }, []);

  const handleSignIn = async () => {
    setLoading(true);
    try {
      await GoogleSignin.hasPlayServices();
      const response = await GoogleSignin.signIn();
      const userInfo = response.data?.user;
      if (!userInfo) throw new Error('No user info returned');
      setUser({
        id: userInfo.id,
        name: userInfo.name ?? null,
        email: userInfo.email,
        photo: userInfo.photo ?? null,
      });
      navigation.replace('Home');
    } catch (error: any) {
      if (error.code !== '-5') {
        // -5 = user cancelled; ignore that
        Alert.alert('Sign-in failed', error.message ?? 'An error occurred. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.appName}>Tablet Notes</Text>
        <Text style={styles.subtitle}>Sign in to continue</Text>

        {loading ? (
          <ActivityIndicator size="large" color="#1A1A1A" style={styles.loader} />
        ) : (
          <GoogleSigninButton
            size={GoogleSigninButton.Size.Wide}
            color={GoogleSigninButton.Color.Dark}
            onPress={handleSignIn}
            style={styles.googleBtn}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    gap: 12,
  },
  appName: {
    fontSize: 36,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
    marginBottom: 24,
  },
  loader: {
    marginTop: 16,
  },
  googleBtn: {
    width: 240,
    height: 56,
  },
});
