import React from 'react';
import { Image, StyleSheet, View } from 'react-native';

/** Face-focused crop of the existing Finn illustration for chat avatars. */
export default function FinnPortrait({ size }: { size: number }) {
  return (
    <View
      style={[styles.frame, { width: size, height: size, borderRadius: size / 2 }]}
      accessibilityLabel="Finn"
    >
      <Image
        source={require('../assets/images/finn-mascot.png')}
        resizeMode="stretch"
        style={{
          position: 'absolute',
          width: size * 2,
          height: size * 2,
          left: -size * 0.38,
          top: -size * 0.16,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden', backgroundColor: '#F5D27C', alignItems: 'center', justifyContent: 'center' },
});
