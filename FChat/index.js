
import {AppRegistry} from 'react-native';
import messaging from '@react-native-firebase/messaging';

import App from './App';
import {name as appName} from './app.json';

// Handle background messages
messaging().setBackgroundMessageHandler(
  async remoteMessage => {
    console.log(
      'Background Notification:',
      remoteMessage,
    );
  },
);

// Register application
AppRegistry.registerComponent(appName, () => App);
