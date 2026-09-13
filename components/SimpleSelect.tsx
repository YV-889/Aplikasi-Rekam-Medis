// Dropdown/select sederhana, dibuat dari komponen dasar React Native
// (Modal + FlatList) supaya tidak perlu install library picker tambahan.

import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface SelectOption {
  label: string;
  value: string;
}

interface SimpleSelectProps {
  label: string;
  placeholder?: string;
  options: SelectOption[];
  selectedValue: string | null;
  onSelect: (value: string) => void;
}

export function SimpleSelect({
  label,
  placeholder = 'Pilih...',
  options,
  selectedValue,
  onSelect,
}: SimpleSelectProps) {
  const [open, setOpen] = useState(false);
  const selectedLabel = options.find((o) => o.value === selectedValue)?.label;

  return (
    <View>
      <Pressable style={styles.trigger} onPress={() => setOpen(true)}>
        <Text style={selectedLabel ? styles.value : styles.placeholder}>
          {selectedLabel ?? placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color="#666" />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{label}</Text>
            <FlatList
              data={options}
              keyExtractor={(item) => item.value}
              ListEmptyComponent={<Text style={styles.empty}>Belum ada data. Tambahkan dulu.</Text>}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.option}
                  onPress={() => {
                    onSelect(item.value);
                    setOpen(false);
                  }}>
                  <Text style={styles.optionText}>{item.label}</Text>
                  {item.value === selectedValue && <Ionicons name="checkmark" size={18} color="#2563eb" />}
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  trigger: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  value: { color: '#111', fontSize: 16 },
  placeholder: { color: '#999', fontSize: 16 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    maxHeight: '60%',
  },
  sheetTitle: { fontSize: 16, fontWeight: '700', color: '#111', marginBottom: 8 },
  option: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  optionText: { fontSize: 15, color: '#111' },
  empty: { color: '#888', textAlign: 'center', paddingVertical: 20 },
});
