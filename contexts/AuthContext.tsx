// Context global untuk status login & profil (role) user.
// Dipakai oleh app/_layout.tsx untuk memutuskan mau diarahkan ke mana.

import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore';

import { auth, db } from '@/config/firebase';
import type { UserProfile } from '@/types/user';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);

      if (firebaseUser) {
        try {
          const userSnap = await getDoc(doc(db, 'users', firebaseUser.uid));

if (!userSnap.exists()) {
  setProfile(null);
} else {
  const userData = userSnap.data() as UserProfile;

  if (userData.role === 'pasien') {
    const q = query(
      collection(db, 'pasienProfile'),
      where('uid', '==', firebaseUser.uid)
    );

    const pasienSnap = await getDocs(q);

    if (!pasienSnap.empty) {
      const pasienData = pasienSnap.docs[0].data();

      setProfile({
        ...userData,
        nik: pasienData.nik,
      } as UserProfile);
    } else {
      setProfile(userData);
    }
  } else {
    setProfile(userData);
  }
}
        } catch (err) {
          console.error('Gagal mengambil profil user:', err);
          console.log(profile);
          setProfile(null);
        }
      } else {
        setProfile(null);
      }

      setLoading(false);
    });

    return unsubscribe;
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
