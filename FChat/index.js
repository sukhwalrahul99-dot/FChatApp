import {AppRegistry} from 'react-native';
import {
  getMessaging,
  setBackgroundMessageHandler,
} from '@react-native-firebase/messaging';

import App from './App';
import {name as appName} from './app.json';

const messaging = getMessaging();

setBackgroundMessageHandler(messaging, async remoteMessage => {
  console.log('Background Notification:', remoteMessage);
});

AppRegistry.registerComponent(appName, () => App);