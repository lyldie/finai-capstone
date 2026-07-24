import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

const PREMIUM_DEEP_GREEN = '#144A3D'; 
const PREMIUM_GOLD = '#D4AF37';       
const MATTE_SAGE_INACTIVE = '#8A9A86'; 

function TabBarIcon(props: {
  name: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
}) {
  return <Ionicons size={24} style={{ marginBottom: -3 }} {...props} />;
}

export default function TabLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: PREMIUM_GOLD, 
          tabBarInactiveTintColor: MATTE_SAGE_INACTIVE, 
          headerShown: false,
          tabBarStyle: {
            backgroundColor: PREMIUM_DEEP_GREEN, 
            borderTopWidth: 1,
            borderTopColor: '#0F332A', 
            paddingBottom: 8,
            height: 65,
            elevation: 10,
            shadowColor: '#142D2A',
            shadowOpacity: 0.1,
            shadowRadius: 10,
          },
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '700',
            marginTop: 2,
          }
        }}>
        
        {/* 1. HOME MODULE */}
        <Tabs.Screen 
          name="index" 
          options={{ 
            title: 'Home', 
            tabBarIcon: ({ color, focused }) => (
              <TabBarIcon name={focused ? "home" : "home-outline"} color={focused ? PREMIUM_GOLD : MATTE_SAGE_INACTIVE} />
            ), 
          }} 
        />

        {/* 2. FINAI INSIGHTS MODULE */}
        <Tabs.Screen 
          name="insights" // Hahanapin nito si app/(tabs)/insights.tsx
          options={{ 
            title: 'Insights', 
            tabBarIcon: ({ color, focused }) => (
              <TabBarIcon name={focused ? "pie-chart" : "pie-chart-outline"} color={focused ? PREMIUM_GOLD : MATTE_SAGE_INACTIVE} />
            ), 
          }} 
        />
        
        {/* ITATAGO NATIN SI TWO SA BOTTOM BAR */}
        <Tabs.Screen 
          name="two"
          options={{
            href: null, // Magic line para mawala yung 'two' sa bottom bar navigation!
          }}
        />

      </Tabs>
    </GestureHandlerRootView>
  );
}