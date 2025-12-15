// ------------------------------------------
// INITIALIZATION
// ------------------------------------------
// We use a public relay peer to sync data.
const DEFAULT_PEERS = ['https://eecs.blog/gun']; //, 'https://gun-manhattan.herokuapp.com/gun' doesn't work anymore

// State
let currentRoom = null; // { id, name, keyPair }

const SEA = Gun.SEA;
let gun;
let user;

document.addEventListener("DOMContentLoaded", () => {
    //Run initialization.
    initializeGun();
});

function initializeGun() {
    //Get current peers from storage and list them in the UI.
    const peers = getPeers();
    renderPeerList(peers);

    //Initialize Gun instance with provided peers and create a user.
    gun = new Gun(peers);
    user = gun.user();
    //Call user.recall() to try and restore the session if present.
    user.recall({ sessionStorage: true }); 
    
    //If user is session was seccessfully recalled, log them in.
    if(user.is)
        logInUser();
}



// ------------------------------------------
// PEERS
// ------------------------------------------
function addPeer() {
    const urlInput = document.getElementById('new-peer-url');
    const newUrl = urlInput.value.trim();

    if (!newUrl) {
        return alert("Please enter a valid peer URL.");
    }
    
    // Check if URL is valid and hasn't been added
    if (!newUrl.startsWith('http')) {
        return alert("URL must start with http:// or https://");
    }

    let peers = getPeers();
    if (peers.includes(newUrl)) {
        return alert("Peer already exists in the list.");
    }

    // 1. Update persistent peer list
    peers.push(newUrl);
    savePeers(peers);

    // 2. Re-initialize Gun with the new list
    alert("Peers updated. Reconnecting to the network. You must re-authenticate.");
    
    // Clear the input
    urlInput.value = '';

    // Re-initialize Gun and prompt for re-login
    initializeGun(() => {
        // Re-run application initialization after re-auth success
        alert("Successfully re-authenticated to the new peer network!");
        // NOTE: You must ensure your existing initApp() or setup logic can handle being called here.
    });

    // NOTE: The user must manually re-enter their alias and password now,
    // as the session token from the old network may not be immediately valid 
    // on the new peer set without re-auth.
}

function removePeer(urlToRemove) {
    if (!confirm(`Are you sure you want to remove the peer: ${urlToRemove}? You will be reconnected to the network.`)) {
        return;
    }

    let peers = getPeers();
    
    // Filter out the URL to remove
    const newPeers = peers.filter(url => url !== urlToRemove);

    if (newPeers.length === peers.length) {
        return alert("Error: Peer not found in list.");
    }
    
    if (newPeers.length === 0) {
        return alert("Cannot remove the last peer. You must keep at least one peer to connect.");
    }

    // 1. Update persistent peer list
    savePeers(newPeers);
    
    // 2. Re-initialize Gun with the shorter list
    alert("Peer removed. Reconnecting to the network. Please re-authenticate if the session is lost.");

    // Re-initialize Gun and prompt for re-login (using the existing functions)
    initializeGun(); 
}

function getPeers() {
    const storedPeers = localStorage.getItem('gunPeers');
    return storedPeers ? JSON.parse(storedPeers) : DEFAULT_PEERS;
}

function savePeers(peers) {
    localStorage.setItem('gunPeers', JSON.stringify(peers));
    renderPeerList(peers);
}

function renderPeerList(peers) {
    const listContainer = document.getElementById('peer-list-container');
    if (!listContainer) return;

    listContainer.innerHTML = '<strong>Connected Peers:</strong>';
    
    // Create a list item for each peer with a remove button
    peers.forEach(peerUrl => {
        const peerItem = document.createElement('div');
        peerItem.style.display = 'flex';
        peerItem.style.alignItems = 'center';
        peerItem.style.justifyContent = 'space-between';
        peerItem.style.padding = '3px 0';

        // Peer URL text
        const urlSpan = document.createElement('span');
        urlSpan.innerText = peerUrl;
        urlSpan.style.wordBreak = 'break-all';
        urlSpan.style.flexGrow = '1';
        urlSpan.style.marginRight = '8px';

        // Remove Button
        const removeBtn = document.createElement('button');
        removeBtn.innerText = 'X';
        removeBtn.title = `Remove ${peerUrl}`;
        removeBtn.style.background = '#880000';
        removeBtn.style.color = 'white';
        removeBtn.style.padding = '2px 6px';
        removeBtn.style.cursor = 'pointer';
        
        // Pass the URL to the removePeer function
        removeBtn.onclick = () => removePeer(peerUrl);

        peerItem.appendChild(urlSpan);
        peerItem.appendChild(removeBtn);
        listContainer.appendChild(peerItem);
    });
}


// ------------------------------------------
// AUTHENTICATION
// ------------------------------------------
async function loginRegister(type) {
    const alias = document.getElementById('username').value;
    const pass = document.getElementById('password').value;
    
    if(type === 'register') {
        user.create(alias, pass, ack => {
            if(ack.err) alert(ack.err);
            else loginRegister('login'); // Auto login after register
        });
    } else {
        user.auth(alias, pass, ack => {
            if(ack.err) {
                document.getElementById('auth-error').innerText = ack.err;
            } else {
                logInUser();
            }
        });
    }
}

function logInUser() {
    //After user is logged in disable the login screen and show app screen.
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('app-screen').classList.remove('hidden');
    document.getElementById('app-screen').style.display = 'flex';
    
    //Display the user's public key for invites.
    document.getElementById('my-pub').innerText = user.is.epub;

    //Register file input change listener for toggling message input.
    document.getElementById('file-input').addEventListener('change', toggleMessageInput);

    //Load any existing rooms.
    loadMyRooms();
    
    //Register invite listener.
    listenForInvites();
}

function logout() {
    if (confirm("Are you sure you want to logout? All local session data will be cleared.")) {
        // 1. Tell Gun to forget this user session
        user.leave();

        // 2. Clear browser session storage to prevent auto-recall
        if (window.sessionStorage) {
            sessionStorage.clear();
        }

        // 3. Clear application state
        currentRoom = null;

        // 4. Reset UI: Show Auth screen, hide App screen
        document.getElementById('app-screen').classList.add('hidden');
        document.getElementById('app-screen').style.display = 'none';
        document.getElementById('auth-screen').classList.remove('hidden');
        
        // Clear input fields
        document.getElementById('username').value = '';
        document.getElementById('password').value = '';
        
        // 5. Reload the page (Safest way to clear memory variables)
        window.location.reload();
    }
}

// ------------------------------------------
// ROOM MANAGEMENT
// ------------------------------------------
async function createRoom() {
    const name = document.getElementById('new-room-name').value;
    if(!name) return;

    // Generate a secure keypair specifically for this room
    const roomPair = await SEA.pair();
    const roomId = await SEA.work(roomPair, null, null, {name: "SHA-256"});

    const roomData = {
        id: roomId,
        name: name,
        key: JSON.stringify(roomPair) // Store key as string
    };

    // Save to my private graph
    user.get('rooms').get(roomId).put(roomData);
    document.getElementById('new-room-name').value = '';
}

function loadMyRooms() {
    user.get('rooms').map().on(async (room, id) => {
        if(!room || !room.name) return;
        
        // UI: Add to list if not exists
        const existing = document.getElementById(`room-${id}`);
        if(existing) return;

        const div = document.createElement('div');
        div.id = `room-${id}`;
        div.className = 'room-item';
        div.innerText = room.name;
        div.onclick = () => selectRoom(room);
        document.getElementById('room-list').appendChild(div);
    });
}

async function selectRoom(room) {
    try {
        // Decrypt room key: Handle both stringified and object keys
        let keyPair = room.key;
        if (typeof keyPair === 'string') {
            keyPair = JSON.parse(keyPair);
        }

        if (!keyPair || !keyPair.epub) {
            throw new Error("Invalid Key Pair data");
        }
        
        // Set the global state for the active room
        currentRoom = { ...room, keyPair };
        
        // UI Updates: Activate the room item in the sidebar
        document.querySelectorAll('.room-item').forEach(el => el.classList.remove('active'));
        const activeItem = document.getElementById(`room-${room.id}`);
        if(activeItem) activeItem.classList.add('active');
        
        document.getElementById('current-room-name').innerText = room.name;
        
        // ENABLE INPUTS AND CONTROLS
        const input = document.getElementById('msg-input');
        const btn = document.getElementById('send-btn');
        
        // 1. Enable Message Input and Send Button
        input.disabled = false;
        btn.disabled = false;
        input.placeholder = `Message ${room.name}...`;
        input.focus(); // Auto focus the cursor

        // 2. Show Room Controls (Invite and Delete/Leave)
        document.getElementById('leave-delete-btn').classList.remove('hidden'); 
        document.getElementById('invite-controls').classList.remove('hidden');
        
        // Clear old chat and load new
        document.getElementById('chat-history').innerHTML = ''; 
        subscribeToMessages(room.id, keyPair);
        
    } catch (e) {
        console.error("Error selecting room:", e);
        alert("Could not open this room. The key might be corrupted.");
        
        // Safety reset on failure
        currentRoom = null;
        document.getElementById('current-room-name').innerText = "Select a Room";
        document.getElementById('msg-input').disabled = true;
        document.getElementById('send-btn').disabled = true;
        document.getElementById('leave-delete-btn').classList.add('hidden');
        document.getElementById('invite-controls').classList.add('hidden');
    }
}

// ------------------------------------------
// MESSAGING (E2EE)
// ------------------------------------------
async function sendMessage() {
    const supported3DFormats = ['.gltf', '.glb', '.obj', '.stl'];
    
    const textInput = document.getElementById('msg-input');
    const fileInput = document.getElementById('file-input');
    const text = textInput.value;
    const file = fileInput.files[0];
    
    if (!currentRoom) {
        alert("Please select a room from the sidebar first!");
        return;
    }
    
    if (!text && !file) return;

    let payload = { type: 'text', content: text };
    
    if (file) {
        const fileNameLower = file.name.toLowerCase();
        const isImage = file.type.startsWith('image/');
        
        // 1. Detect 3D file extension
        const is3D = supported3DFormats.some(ext => fileNameLower.endsWith(ext));

        // --- Base64 Encoding ---
        const base64Content = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });

        if (!base64Content) {
            alert("Could not read file.");
            return;
        }

        let fileType;
        if (isImage) {
            fileType = 'image';
        } else if (is3D) {
            fileType = '3d';
        } else {
            fileType = 'file';
        }

        payload = {
            type: fileType,
            content: base64Content,
            fileName: file.name,
            mimeType: file.type
        };
    }
    
    try {
        if(!currentRoom.keyPair || !currentRoom.keyPair.epub) {
            console.error("Room keys are missing", currentRoom);
            return alert("Error: Room keys missing.");
        }

        // --- Encryption ---
        const secret = await SEA.secret(currentRoom.keyPair.epub, currentRoom.keyPair);
        const encryptedMsg = await SEA.encrypt(JSON.stringify(payload), secret);

        const msgData = {
            who: user.is.alias,
            msg: encryptedMsg,
            when: Date.now()
        };

        gun.get('chat-rooms').get(currentRoom.id).set(msgData);
        
        // UI Cleanup
        textInput.value = '';
        fileInput.value = ''; 
        textInput.focus();
        toggleMessageInput();
        
    } catch (e) {
        console.error("Encryption failed:", e);
        alert("Failed to send message. See console.");
    }
}

function subscribeToMessages(roomId, roomKey) {
    // .map() iterates over items in the set
    gun.get('chat-rooms').get(roomId).map().on(async (node, id) => {
        if(!node.msg) return;

        // Decrypt
        const secret = await SEA.secret(roomKey.epub, roomKey);
        const decrypted = await SEA.decrypt(node.msg, secret);

        if(decrypted) {
            renderMessage(id, node.who, decrypted, node.when);
        }
    });
}

function renderMessage(id, who, payload, when) {
    if(document.getElementById(id)) return;

    const history = document.getElementById('chat-history');

    const div = document.createElement('div');
    div.id = id;
    div.className = `message ${who === user.is.alias ? 'mine' : ''}`;
    
    const meta = document.createElement('span');
    meta.className = 'meta';
    meta.innerText = `${who} • ${new Date(when).toLocaleTimeString()}`;

    div.appendChild(meta);
    
    // --- Handle Multimedia/File Content ---
    if (payload.type === 'image') {
        const image = document.createElement('img');
        image.src = payload.content; 
        image.alt = payload.fileName || 'Encrypted Image';
        image.style.maxWidth = '100%';
        image.style.height = 'auto';
        image.style.borderRadius = '5px';
        
        div.appendChild(image);
        
    } else if (payload.type === '3d') {
        // Handle 3D Model File
        const fileContainer = document.createElement('div');
        fileContainer.style.display = 'flex';
        fileContainer.style.alignItems = 'center';
        fileContainer.style.gap = '8px';
        fileContainer.style.padding = '5px';
        
        // 1. Descriptive File Info (3D icon)
        const fileInfo = document.createElement('span');
        fileInfo.style.fontWeight = 'normal';
        fileInfo.style.color = 'white';
        fileInfo.innerHTML = `🧊 ${payload.fileName} <span style="font-size: 0.8em;">(3D Model)</span>`;
        fileContainer.appendChild(fileInfo);
        
        // 2. Download Link (Only download icon is clickable)
        const fileLink = document.createElement('a');
        fileLink.href = payload.content;
        fileLink.download = payload.fileName || '3d_model';
        fileLink.target = '_blank';
        fileLink.style.textDecoration = 'none';
        
        fileLink.innerHTML = `<span style="font-size: 1.1em; color: var(--accent);">⬇️</span>`;
        
        fileContainer.appendChild(fileLink);
        
        div.appendChild(fileContainer);

        // 2. Container for the Three.js Viewer
        const viewerContainer = document.createElement('div');
        viewerContainer.className = 'viewer-container';
        viewerContainer.id = `viewer-${id}`; // Unique ID for Three.js target
        div.appendChild(viewerContainer);

        // 3. Initialize the 3D viewer after the message is added to DOM
        setTimeout(() => {
            // Only initialize if the required libraries are loaded
            if (typeof THREE !== 'undefined' && typeof THREE.GLTFLoader !== 'undefined') {
                init3DViewer(`viewer-${id}`, payload.content, payload.fileName);
            } else {
                viewerContainer.innerHTML = '3D Viewer libraries failed to load.';
            }
        }, 50); // Small delay ensures the element is rendered to the DOM


    } else if (payload.type === 'file') {
        // Handle generic downloadable file
        const fileContainer = document.createElement('div');
        fileContainer.style.display = 'flex';
        fileContainer.style.alignItems = 'center';
        fileContainer.style.gap = '8px';
        fileContainer.style.padding = '5px';
        
        // 1. Descriptive File Info
        const fileInfo = document.createElement('span');
        fileInfo.style.fontWeight = 'normal';
        fileInfo.style.color = 'white';
        fileInfo.innerHTML = `📄 ${payload.fileName}`;
        fileContainer.appendChild(fileInfo);

        // 2. Download Link
        const fileLink = document.createElement('a');
        fileLink.href = payload.content; 
        fileLink.download = payload.fileName || 'downloaded_file';
        fileLink.target = '_blank';
        fileLink.style.textDecoration = 'none';
        
        fileLink.innerHTML = `<span style="font-size: 1.1em; color: var(--accent);">⬇️</span>`;
        
        fileContainer.appendChild(fileLink);
        div.appendChild(fileContainer);

    } else {
        // Handle plain text
        div.appendChild(document.createTextNode(payload.content));
    }

    history.appendChild(div);
    history.scrollTop = history.scrollHeight;
}

// Function to toggle input state based on file selection
function toggleMessageInput() {
    const fileInput = document.getElementById('file-input');
    const textInput = document.getElementById('msg-input');
    
    // Check if a file is currently selected
    if (fileInput.files.length > 0) {
        // Disable the text box and clear its content
        textInput.disabled = true;
        textInput.value = '';
        textInput.placeholder = "File attached. Clear file selection to type text.";
    } else {
        // Re-enable the text box
        textInput.disabled = false;
        textInput.placeholder = currentRoom 
            ? `Message ${currentRoom.name}...` 
            : "Type a message...";
    }
}

// Function to handle keyboard events in the message input
function handleInputKey(event) {
    // Check if the pressed key is 'Enter'
    if (event.key === 'Enter' || event.keyCode === 13) {
        // Prevent the default action (like adding a newline)
        event.preventDefault(); 
        
        // Call existing function to process and send the message
        sendMessage();
    }
}

// ------------------------------------------
// INVITATION SYSTEM
// ------------------------------------------
function copyPub() {
    navigator.clipboard.writeText(user.is.epub);
    alert("Public Key copied to clipboard!");
}

async function inviteUser() {
    const peerEpub = document.getElementById('invite-pub').value.trim(); // User now pastes an EPUB
    if(!peerEpub || !currentRoom) return alert("Need Public Key and Active Room");

    // 1. Generate Shared Secret (My Priv + Their EPUB)
    // Now we are mixing Encryption Key + Encryption Key. This works!
    const secret = await SEA.secret(peerEpub, user._.sea); 
    
    const encryptedRoomData = await SEA.encrypt(JSON.stringify({
        name: currentRoom.name,
        key: currentRoom.key,
        id: currentRoom.id
    }), secret);

    // 3. Post to a public "Invites" node 
    // CHANGE: Use user.is.epub here so the receiver gets the correct key to reply with
    gun.get('decent-chat-invites').get(peerEpub).get(user.is.epub).put(encryptedRoomData);
    
    alert("Invite Sent!");
}

function listenForInvites() {
    gun.get('decent-chat-invites').get(user.is.epub).map().on(async (encryptedData, senderEpub) => {
        
        // Filter out the 'underscore' metadata key
        if(!encryptedData || senderEpub === '_') return;

        try {
            // Now senderEpub is actually an EPUB (because we changed step 2)
            const secret = await SEA.secret(senderEpub, user._.sea);
            const decrypted = await SEA.decrypt(encryptedData, secret);

            if(decrypted) {
                showInviteUI(decrypted, senderEpub);
            } 
        } catch (e) {
            console.error("Decryption error", e);
        }
    });
}

function showInviteUI(inviteData, senderEpub) {
    // Check if we already have this room
    if(document.getElementById(`room-${inviteData.id}`)) return;

    const div = document.createElement('div');
    // We use the sender's EPUB to create a unique ID for easy removal later
    div.id = `invite-${senderEpub}`; 
    div.style = "background: #333; padding: 5px; margin-top: 5px; font-size: 0.8em; border: 1px solid var(--accent);";
    
    // NOTE: We pass 'senderEpub' to both acceptance and rejection handlers
    div.innerHTML = `
        <strong>Invite:</strong> ${inviteData.name}<br>
        <button onclick='acceptInvite(${JSON.stringify(inviteData)}, "${senderEpub}")'>Accept</button>
        <button onclick='rejectInvite("${senderEpub}")'>Reject</button>
    `;
    document.getElementById('invite-list').appendChild(div);
}

window.acceptInvite = async function(roomData, senderEpub) {
    // 1. Save the Decrypted Room Key to MY private chats list (Existing Logic)
    user.get('rooms').get(roomData.id).put({
        name: roomData.name,
        key: roomData.key,
        id: roomData.id
    });
    
    // 2. NEW: Delete the invite from the public mailbox by setting the node to null
    // Path: app-invites / MyEPUB / SenderEPUB -> null
    gun.get('decent-chat-invites').get(user.is.epub).get(senderEpub).put(null);

    // 3. Remove the invite UI element locally
    const inviteElement = document.getElementById(`invite-${senderEpub}`);
    if (inviteElement) {
        inviteElement.remove();
    }
    
    alert(`Joined ${roomData.name}!`);
}

window.rejectInvite = async function(senderEpub) {
    if (!confirm(`Are you sure you want to reject the invite from ${senderEpub}?`)) {
        return;
    }
    
    // 1. Delete the invite data from the public mailbox by setting the node to null
    // Path: app-invites / MyEPUB / SenderEPUB -> null
    // Note: Use gun.put(null) to delete graph data.
    gun.get('decent-chat-invites').get(user.is.epub).get(senderEpub).put(null);

    // 2. Remove the invite UI element locally
    const inviteElement = document.getElementById(`invite-${senderEpub}`);
    if (inviteElement) {
        inviteElement.remove();
    }
    
    console.log(`Invite from ${senderEpub} rejected and removed.`);
}

async function deleteRoom(roomId) {
    if (!roomId) return alert("No room selected or ID provided.");

    const roomName = currentRoom ? currentRoom.name : 'this room';
    
    // Check if the user was currently viewing this room before deletion
    if (currentRoom && currentRoom.id === roomId) {
        currentRoom = null;
        document.getElementById('current-room-name').innerText = "Select a Room";
        document.getElementById('chat-history').innerHTML = '';
        document.getElementById('invite-controls').classList.add('hidden');
        
        // ✨ FIX: Explicitly disable input and send button when no room is selected
        document.getElementById('msg-input').disabled = true;
        document.getElementById('send-btn').disabled = true;
        document.getElementById('msg-input').placeholder = "Type a message..."; // Reset placeholder

        // Hide the Leave/Delete button
        document.getElementById('leave-delete-btn').classList.add('hidden'); 
    }

    // 1. CONFIRMATION
    const confirmation = prompt(`Are you sure you want to delete/leave "${roomName}"? Type "DELETE" to confirm:`);
    if (confirmation !== 'DELETE') {
        return alert("Deletion cancelled.");
    }

    // Check if the user was currently viewing this room before deletion
    if (currentRoom && currentRoom.id === roomId) {
        currentRoom = null;
        document.getElementById('current-room-name').innerText = "Select a Room";
        document.getElementById('chat-history').innerHTML = '';
        document.getElementById('invite-controls').classList.add('hidden');
        
        // NEW: Hide the Leave/Delete button
        document.getElementById('leave-delete-btn').classList.add('hidden'); 
    }
    
    // 2. REMOVE PRIVATE ACCESS (Essential for leaving/deleting)
    // Delete the room key from the user's private list. This prevents all access.
    user.get('rooms').get(roomId).put(null);
    console.log(`Removed private access to room: ${roomId}`);
    
    // 3. CLEAN UP PUBLIC MESSAGES (Optional for creators)
    // In a dApp, a user generally only deletes their own message history, 
    // but for simplicity, we allow deleting the root node.
    
    const alsoDeleteHistory = confirm("Do you want to permanently delete the public message history for this room too? (ONLY DO THIS IF YOU CREATED THE ROOM)");
    
    if (alsoDeleteHistory) {
        // Deleting the root node of the chat history
        gun.get('chat-rooms').get(roomId).put(null);
        alert(`Room "${roomName}" and its public history have been deleted.`);
    } else {
        alert(`You have successfully left "${roomName}". The history remains for others.`);
    }
    
    // 4. Update UI
    const roomElement = document.getElementById(`room-${roomId}`);
    if (roomElement) {
        roomElement.remove();
    }
}



// ------------------------------------------
// OTHER UI
// ------------------------------------------
function openAboutModal() {
    const modal = document.getElementById('about-modal');
    if (modal) {
        modal.style.display = 'block';
    }
}

function closeAboutModal() {
    const modal = document.getElementById('about-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Close modal if user clicks outside of the content box
window.onclick = function(event) {
    const modal = document.getElementById('about-modal');
    if (event.target == modal) {
        closeAboutModal();
    }
}

// Mobile sidebar toggle
function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) {
        sidebar.classList.toggle('open');
    }
}



// ------------------------------------------
// 3D VIEWER INITIALIZATION
// ------------------------------------------
function init3DViewer(containerId, base64Data, fileName) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    // --- Scene Setup ---
    // ... (Scene, Camera, Renderer, Controls, and Lighting setup remains the same) ...
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x333333); 
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.z = 2;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    container.appendChild(renderer.domElement);
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; 
    controls.dampingFactor = 0.05;
    controls.minDistance = 0.5;
    controls.maxDistance = 10;
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(1, 1, 1).normalize();
    scene.add(directionalLight);

    // --- Core Loading Logic Update ---
    
    // Function to handle centering and scaling of the loaded model
    function setupModel(model) {
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());

        model.position.sub(center); 
        
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 1.5 / maxDim; // Fit within a radius of 1.5
        model.scale.set(scale, scale, scale);

        scene.add(model);
        controls.target.copy(model.position);
    }
    
    const fileNameLower = fileName.toLowerCase();

    if (fileNameLower.endsWith('.glb') || fileNameLower.endsWith('.gltf')) {
        // --- GLTF/GLB Loading ---
        const gltfLoader = new THREE.GLTFLoader();
        gltfLoader.load(base64Data, function (gltf) {
            setupModel(gltf.scene);
        }, undefined, function (error) {
            console.error('An error occurred during GLTF loading:', error);
            container.innerHTML = 'Error loading GLTF model.';
        });

    } else if (fileNameLower.endsWith('.obj')) {
        // --- OBJ Loading ---
        if (typeof THREE.OBJLoader === 'undefined') {
             container.innerHTML = 'OBJLoader not found. Check imports.';
             return;
        }

        const objLoader = new THREE.OBJLoader();
        objLoader.load(base64Data, function (group) {
            setupModel(group);
        }, undefined, function (error) {
            console.error('An error occurred during OBJ loading:', error);
            container.innerHTML = 'Error loading OBJ model. (Did you forget .mtl?)';
        });

    } else {
        // Fallback for unsupported formats
        container.innerHTML = `Cannot display ${fileName}. Viewer only supports GLTF/GLB and OBJ via Data URI.`;
        console.warn(`File type not supported: ${fileName}`);
        return;
    }


    // --- Animation Loop ---
    function animate() {
        requestAnimationFrame(animate);
        controls.update(); // only required if controls.enableDamping is set to true
        renderer.render(scene, camera);
    }
    animate();

    // Handle resizing (if needed) - crucial if you allow chat resizing
    window.addEventListener('resize', () => {
        const newWidth = container.clientWidth;
        const newHeight = container.clientHeight;
        camera.aspect = newWidth / newHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(newWidth, newHeight);
    });
}