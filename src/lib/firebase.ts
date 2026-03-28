// firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// 🔴 Replace this with YOUR Firebase config from the Firebase console
const firebaseConfig = {
  apiKey: "AIzaSyBP6XW7-NioybS92LSGng3okRisOVoOFpM",
  authDomain: "varsity-majisty.firebaseapp.com",
  databaseURL: "https://varsity-majisty-default-rtdb.firebaseio.com",
  projectId: "varsity-majisty",
  storageBucket: "varsity-majisty.firebasestorage.app",
  messagingSenderId: "438882953423",
  appId: "1:438882953423:web:4b8c282d7719d3a4e36fba",
  measurementId: "G-QLBK1QFT74"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db };
