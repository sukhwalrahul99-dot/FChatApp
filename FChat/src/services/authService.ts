
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from '@react-native-firebase/auth';

import {
  doc,
  setDoc,
  serverTimestamp,
} from '@react-native-firebase/firestore';

import {
  getMessaging,
  getToken,
  requestPermission,
  AuthorizationStatus,
  onTokenRefresh,
} from '@react-native-firebase/messaging';

import {auth, db} from './firebase';

// Register and save FCM device token
export const registerFCMToken = async (uid: string) => {
  try {
    const messaging = getMessaging();

    // Request notification permission
    const permission = await requestPermission(messaging);

    const isAuthorized =
      permission === AuthorizationStatus.AUTHORIZED ||
      permission === AuthorizationStatus.PROVISIONAL;

    if (!isAuthorized) {
      console.log('Notification permission not granted');
      return null;
    }

    // Generate FCM token
    const token = await getToken(messaging);

    if (!token) {
      console.log('FCM token not generated');
      return null;
    }

    // Save token in Firestore
    await setDoc(
      doc(db, 'users', uid),
      {
        fcmToken: token,
        fcmTokenUpdatedAt: serverTimestamp(),
      },
      {merge: true},
    );

    console.log('FCM Token Saved Successfully');

    return token;
  } catch (error) {
    console.log('FCM Token Error:', error);
    return null;
  }
};

// Listen for FCM token refresh
export const listenToFCMTokenRefresh = (uid: string) => {
  const messaging = getMessaging();

  return onTokenRefresh(messaging, async token => {
    try {
      await setDoc(
        doc(db, 'users', uid),
        {
          fcmToken: token,
          fcmTokenUpdatedAt: serverTimestamp(),
        },
        {merge: true},
      );

      console.log('FCM Token Updated Successfully');
    } catch (error) {
      console.log('FCM Token Update Error:', error);
    }
  });
};

// Register User
export const registerUser = async (
  name: string,
  email: string,
  password: string,
) => {
  const cleanName = name.trim();
  const cleanEmail = email.trim().toLowerCase();

  try {
    const credential = await createUserWithEmailAndPassword(
      auth,
      cleanEmail,
      password,
    );

    await updateProfile(credential.user, {
      displayName: cleanName,
    });

    await setDoc(doc(db, 'users', credential.user.uid), {
      uid: credential.user.uid,
      name: cleanName,
      email: cleanEmail,
      createdAt: serverTimestamp(),
    });

    await registerFCMToken(credential.user.uid);

    return credential.user;
  } catch (error) {
    console.log('Register Error:', error);
    throw error;
  }
};

// Login User
export const loginUser = async (
  email: string,
  password: string,
) => {
  try {
    const credential = await signInWithEmailAndPassword(
      auth,
      email.trim().toLowerCase(),
      password,
    );

    await registerFCMToken(credential.user.uid);

    return credential.user;
  } catch (error) {
    console.log('Login Error:', error);
    throw error;
  }
};

// Logout User
export const logoutUser = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.log('Logout Error:', error);
    throw error;
  }
};
