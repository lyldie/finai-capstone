import React, { useState, useCallback } from 'react';
import { 
  View, Text, FlatList, TouchableOpacity, StyleSheet, 
  ActivityIndicator, StatusBar, SafeAreaView, Alert 
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../../config';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

export default function UsersManagementScreen() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      fetchUsers();
    }, [])
  );

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/users/`);
      const data = await response.json();
      setUsers(data);
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setLoading(false);
    }
  };

  const deleteUser = async (id: string, name: string) => {
    Alert.alert("Delete User", `Sigurado ka bang i-ba-ban at i-de-delete mo si ${name}? Mabubura rin ang data niya.`, [
      { text: "Cancel", style: "cancel" },
      { 
        text: "Delete", style: "destructive",
        onPress: async () => {
          const response = await fetch(`${API_URL}/api/users/${id}`, { method: 'DELETE' });
          if (response.ok) {
            Alert.alert("Success", "User deleted.");
            fetchUsers();
          } else {
            Alert.alert("Error", "Hindi ma-delete ang user.");
          }
        }
      }
    ]);
  };

  const renderUserItem = ({ item }: { item: User }) => (
    <View style={styles.card}>
      <View style={styles.cardInfo}>
        <View style={[styles.iconBox, { backgroundColor: item.role === 'admin' ? '#e3f2fd' : '#e8f5e9' }]}>
          <Ionicons 
            name={item.role === 'admin' ? "shield-checkmark" : "person"} 
            size={20} 
            color={item.role === 'admin' ? "#1976d2" : "#2e7d32"} 
          />
        </View>
        <View>
          <Text style={styles.cardTitle}>{item.name}</Text>
          <Text style={styles.cardSubtitle}>{item.email}</Text>
        </View>
      </View>
      
      {item.role !== 'admin' && ( // Bawal i-delete ng admin ang sarili niya o ibang admin
        <TouchableOpacity onPress={() => deleteUser(item.id, item.name)} style={styles.deleteBtn}>
          <Ionicons name="trash-outline" size={20} color="#c62828" />
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#1c3c36" />
        </TouchableOpacity>
        <Text style={styles.title}>User Management</Text>
        <View style={{width: 24}} /> 
      </View>

      {loading ? <ActivityIndicator size="large" color="#3D7D6C" style={{flex: 1}} /> : (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id}
          renderItem={renderUserItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Text style={styles.emptyText}>No registered users yet.</Text>}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f7f6' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 25 },
  title: { fontSize: 24, fontWeight: '900', color: '#1c3c36' },
  listContent: { paddingHorizontal: 25, paddingBottom: 40 },
  card: { backgroundColor: '#ffffff', padding: 20, borderRadius: 20, marginBottom: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', elevation: 2 },
  cardInfo: { flexDirection: 'row', alignItems: 'center' },
  iconBox: { width: 45, height: 45, borderRadius: 15, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#1c3c36' },
  cardSubtitle: { fontSize: 12, color: '#8BA19D', marginTop: 2 },
  deleteBtn: { padding: 8, backgroundColor: '#ffebee', borderRadius: 10 },
  emptyText: { textAlign: 'center', color: '#8BA19D', marginTop: 50, fontStyle: 'italic' }
});