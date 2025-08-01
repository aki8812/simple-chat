const firebaseConfig = {
  apiKey: "AIzaSyB9XkO17IHNggQwL__8ock3KCZOlBP8wcA",
  authDomain: "simple-chat-41e8d.firebaseapp.com",
  databaseURL: "https://simple-chat-41e8d-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "simple-chat-41e8d",
  storageBucket: "simple-chat-41e8d.firebasestorage.app",
  messagingSenderId: "181779135449",
  appId: "1:181779135449:web:6e87dcfd5a72b2c1b1f7c8"
};


firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const messagesRef = db.ref("messages");


function sendMessage() {
  const input = document.getElementById("messageInput");
  const message = input.value.trim();
  if (message === "") return;

  const timestamp = Date.now();
  const newMessage = {
    text: message,
    time: timestamp
  };

  messagesRef.push(newMessage); 
  input.value = "";
}


messagesRef.on("child_added", function(snapshot) {
  const message = snapshot.val();
  const msgElement = document.createElement("div");
  const time = new Date(message.time).toLocaleTimeString();
  msgElement.textContent = `[${time}] ${message.text}`;
  document.getElementById("messages").appendChild(msgElement);


  const box = document.getElementById("messages");
  box.scrollTop = box.scrollHeight;
});
