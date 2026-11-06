
import {getApp} from '@react-native-firebase/app';
import {getAuth} from '@react-native-firebase/auth';
import {getFirestore} from '@react-native-firebase/firestore';
import {getMessaging} from '@react-native-firebase/messaging';

// Firebase App
export const app = getApp();

// Firebase Authentication
export const auth = getAuth(app);

// Firebase Firestore
export const db = getFirestore(app);

// Firebase Cloud Messaging
export const messaging = getMessaging(app);
