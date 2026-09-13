export interface ResepItem {
  obatId: string;
  namaObat: string; // didenormalisasi biar nggak perlu join
  dosis: string; // mis. "3x1 tablet sehari"
  jumlah: number;
}

export interface Resep {
  id: string;
  medicalRecordId: string; // FK ke medicalRecords/{id}
  pasienNik: string;
  dokterUid: string;
  items: ResepItem[];
  catatan?: string;
  createdAt?: any;
}