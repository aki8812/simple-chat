import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-database.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyB9XkO17IHNggQwL__8ock3KCZOlBP8wcA",
  authDomain: "simple-chat-41e8d.firebaseapp.com",
  databaseURL: "https://simple-chat-41e8d-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "simple-chat-41e8d",
  storageBucket: "simple-chat-41e8d.appspot.com",
  messagingSenderId: "181779135449",
  appId: "1:181779135449:web:6e87dcfd5a72b2c1b1f7c8"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getDatabase(app);
export const storage = getStorage(app);
