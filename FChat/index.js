
import {AppRegistry} from 'react-native';

import {
  getMessaging,
  setBackgroundMessageHandler,
} from '@react-native-firebase/messaging';

import notifee from '@notifee/react-native';

import App from './App';
import {name as appName} from './app.json';

import {
  displayChatNotification,
  handleNotificationEvent,
} from './src/services/notificationService';

const messaging = getMessaging();

// Background FCM notification
setBackgroundMessageHandler(
  messaging,
  async remoteMessage => {
    console.log('Background Notification:', remoteMessage);

    await displayChatNotification(remoteMessage);
  },
);

// Background notification Reply action
notifee.onBackgroundEvent(handleNotificationEvent);

AppRegistry.registerComponent(appName, () => App);
