
import React, {useEffect, useState} from 'react';

import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  View,
} from 'react-native';

import {
  onAuthStateChanged,
  User,
} from '@react-native-firebase/auth';

import {
  getMessaging,
  onMessage,
} from '@react-native-firebase/messaging';

import notifee, {
  AndroidImportance,
} from '@notifee/react-native';

import {auth} from './src/services/firebase';

import {
  listenToFCMTokenRefresh,
  registerFCMToken,
} from './src/services/authService';

import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import UsersScreen from './src/screens/UsersScreen';
import ChatScreen from './src/screens/ChatScreen';
import CreateGroupScreen from './src/screens/CreateGroupScreen';
import GroupChatScreen from './src/screens/GroupChatScreen';

import {UserProfile} from './src/types';

interface SelectedGroup {
  id: string;
  groupName: string;
  members: string[];
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const [selectedUser, setSelectedUser] =
    useState<UserProfile | null>(null);

  const [selectedGroup, setSelectedGroup] =
    useState<SelectedGroup | null>(null);

  const [showRegister, setShowRegister] = useState(false);

  const [showCreateGroup, setShowCreateGroup] = useState(false);

  const [loading, setLoading] = useState(true);

  // 1. Firebase Authentication Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, user => {
      setCurrentUser(user);
      setSelectedUser(null);
      setSelectedGroup(null);
      setShowCreateGroup(false);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  // 2. FCM Token Registration
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

  // 3. Notification Channel
  useEffect(() => {
    const setupNotificationChannel = async () => {
      try {
        await notifee.createChannel({
          id: 'default',
          name: 'Default Notifications',
          importance: AndroidImportance.HIGH,
          sound: 'default',
        });
      } catch (error) {
        console.log('Notification Channel Error:', error);
      }
    };

    setupNotificationChannel();
  }, []);

  // 4. Foreground Notification Listener
  useEffect(() => {
    const messaging = getMessaging();

    const unsubscribe = onMessage(
      messaging,
      async remoteMessage => {
        console.log('Foreground Notification:', remoteMessage);

        try {
          await notifee.displayNotification({
            title:
              remoteMessage.notification?.title || 'New Message',

            body:
              remoteMessage.notification?.body ||
              'You received a new message',

            android: {
              channelId: 'default',
              importance: AndroidImportance.HIGH,
              sound: 'default',
              pressAction: {
                id: 'default',
                launchActivity: 'default',
              },
            },
          });
        } catch (error) {
          console.log('Display Notification Error:', error);
        }
      },
    );

    return unsubscribe;
  }, []);

  // 5. Loading Screen
  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  // 6. Main UI
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

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
        <ChatScreen
          currentUserId={currentUser.uid}
          selectedUser={selectedUser}
          onBack={() => setSelectedUser(null)}
        />
      ) : selectedGroup ? (
        <GroupChatScreen
          currentUserId={currentUser.uid}
          groupId={selectedGroup.id}
          groupName={selectedGroup.groupName}
          memberCount={selectedGroup.members.length}
          onBack={() => setSelectedGroup(null)}
        />
      ) : showCreateGroup ? (
        <CreateGroupScreen
          currentUserId={currentUser.uid}
          onBack={() => setShowCreateGroup(false)}
          onGroupCreated={() => {
            setShowCreateGroup(false);
          }}
        />
      ) : (
        <UsersScreen
          currentUserId={currentUser.uid}
          currentUserEmail={currentUser.email || ''}
          onUserSelect={user => {
            setSelectedUser(user);
          }}
          onCreateGroup={() => {
            setShowCreateGroup(true);
          }}
          onGroupSelect={group => {
            setSelectedGroup({
              id: group.id,
              groupName: group.groupName || 'Group',
              members: group.members || [],
            });
          }}
          onLogout={() => {
            setSelectedUser(null);
            setSelectedGroup(null);
            setShowCreateGroup(false);
          }}
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
