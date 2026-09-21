import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

// ---- FINAI BRAND TOKENS (matches every other screen) ----
const DEEP_GREEN = '#1c3c36';
const GOLD = '#edb232';
const SAGE = '#8BA19D';

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
          tabBarActiveTintColor: GOLD, 
          tabBarInactiveTintColor: SAGE, 
          headerShown: false,
          tabBarStyle: {
            backgroundColor: DEEP_GREEN, 
            borderTopWidth: 0,
            paddingBottom: 8,
            height: 65,
            elevation: 10,
            shadowColor: DEEP_GREEN,
            shadowOpacity: 0.15,
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
              <TabBarIcon name={focused ? "home" : "home-outline"} color={focused ? GOLD : SAGE} />
            ), 
          }} 
        />

        {/* 2. TRANSACTIONS MODULE (HISTORY) */}
        <Tabs.Screen 
          name="transactions" 
          options={{ 
            title: 'Transactions', 
            tabBarIcon: ({ color, focused }) => (
              <TabBarIcon name={focused ? "receipt" : "receipt-outline"} color={focused ? GOLD : SAGE} />
            ), 
          }} 
        />

        {/* 3. FINAI INSIGHTS MODULE */}
        <Tabs.Screen 
          name="insights" 
          options={{ 
            title: 'Insights', 
            tabBarIcon: ({ color, focused }) => (
              <TabBarIcon name={focused ? "pie-chart" : "pie-chart-outline"} color={focused ? GOLD : SAGE} />
            ), 
          }} 
        />
        
        {/* ITATAGO NATIN SI TWO SA BOTTOM BAR */}
        <Tabs.Screen 
          name="two"
          options={{
            href: null, 
          }}
        />
        <Tabs.Screen
          name="notifications"
          options={{ href: null }}
        />
        {/* ITATAGO NATIN SI CUSTOM PRESETS SA BOTTOM BAR */}
        <Tabs.Screen
          name="custom-presets"
          options={{ href: null }}
        />
      </Tabs>
    </GestureHandlerRootView>
  );
}