
import React, {useEffect, useState} from 'react';

import {
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  View,
  Alert,
} from 'react-native';

import {
  onAuthStateChanged,
  User,
} from '@react-native-firebase/auth';

import {
  getMessaging,
  onMessage,
} from '@react-native-firebase/messaging';

import {auth} from './src/services/firebase';

import {
  listenToFCMTokenRefresh,
  registerFCMToken,
} from './src/services/authService';

import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import UsersScreen from './src/screens/UsersScreen';
import ChatScreen from './src/screens/ChatScreen';

import {UserProfile} from './src/types';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const [selectedUser, setSelectedUser] =
    useState<UserProfile | null>(null);

  const [showRegister, setShowRegister] = useState(false);

  const [loading, setLoading] = useState(true);

  // Firebase authentication listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, user => {
      setCurrentUser(user);
      setSelectedUser(null);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  // Register FCM token and listen for token refresh
  useEffect(() => {
    if (!currentUser) {
      return;
    }

    registerFCMToken(currentUser.uid);

    const unsubscribeToken = listenToFCMTokenRefresh(
      currentUser.uid,
    );

    return unsubscribeToken;
  }, [currentUser?.uid]);

  // Foreground notification listener
  useEffect(() => {
    const messaging = getMessaging();

    const unsubscribe = onMessage(
      messaging,
      async remoteMessage => {
        console.log(
          'Foreground Notification:',
          remoteMessage,
        );

        const title =
          remoteMessage.notification?.title || 'New Notification';

        const body =
          remoteMessage.notification?.body || 'You received a new message';

        Alert.alert(title, body);
      },
    );

    return unsubscribe;
  }, []);

  // Loading screen
  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator
          size="large"
          color="#2563EB"
        />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Login and Register */}
      {!currentUser ? (
        showRegister ? (
          <RegisterScreen
            onLoginPress={() => setShowRegister(false)}
          />
        ) : (
          <LoginScreen
            onRegisterPress={() => setShowRegister(true)}
          />
        )
      ) : selectedUser ? (

        /* One-to-One Chat Screen */
        <ChatScreen
          currentUserId={currentUser.uid}
          selectedUser={selectedUser}
          onBack={() => setSelectedUser(null)}
        />

      ) : (

        /* Users List Screen */
        <UsersScreen
          currentUserId={currentUser.uid}
          currentUserEmail={currentUser.email || ''}
          onUserSelect={user => setSelectedUser(user)}
          onLogout={() => setSelectedUser(null)}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FB',
  },

  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F7FB',
  },
});
