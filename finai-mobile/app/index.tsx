import { Redirect } from 'expo-router';

import { useEffect, useState } from 'react';

import AsyncStorage from '@react-native-async-storage/async-storage';

import { View, ActivityIndicator } from 'react-native';



export default function Index() {

  const [rootScreen, setRootScreen] = useState<string | null>(null);



  useEffect(() => {

    const checkUserStatus = async () => {

      try {

        // Tinitignan natin kung may naka-set nang PIN

        const savedPin = await AsyncStorage.getItem('user_pin');

       

        if (savedPin) {

          // Kung meron na, diretso sa PIN Login

          setRootScreen('/pin-login');

        } else {

          // Kung wala pa, First Time user 'to, sa Get Started muna

          setRootScreen('/getstarted');

        }

      } catch (e) {

        // Default sa getstarted kapag may error

        setRootScreen('/getstarted');

      }

    };



    checkUserStatus();

  }, []);



  // Habang nag-iisip pa yung app (loading), ipakita muna natin 'to

  if (!rootScreen) {

    return (

      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1c3c36' }}>

        <ActivityIndicator size="large" color="#edb232" />

      </View>

    );

  }



  // Kapag may decision na, ire-redirect na niya sa tamang screen

  return <Redirect href={rootScreen as any} />;

}