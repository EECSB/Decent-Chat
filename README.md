# Decent Chat

![decent chat app image](https://eecs.blog/wp-content/uploads/2026/01/decent-chat-image.png)

## About
This is a secure, peer-to-peer chat application built using [GUN.js]([https://gun.js.org/](https://github.com/amark/gun))(decentralized graph database).

I made this because I wanted to make my own simple chat app to avoid using the centralized alternatives.
I decided to use Gun.js for storage/communication as I have already used it in a few other projects of mine, like [online C# compiler](https://github.com/EECSB/CsharpOnlineCompiler), [Decent Paste](https://github.com/EECSB/DecentPaste), [Decent Diff](https://github.com/EECSB/DecentDiff). 

The account and its data are saved to the GUN.js decentralized database. **Warning: I'm not hosting a relay node, so any data you save is reliant on public nodes, which may not store your data indefinitely.** You can add additional nodes under: Gun Peers

**Warning:** I mostly "vibe coded" the app with **Google Gemini Coder** in one day, as I thought this small project would be a good test case for it. So the code might not be the best, and there might be bugs or vulnerabilities in the app. Use it at your own risk.

## App Features
- **Decentralized:** Messages and room data are stored across a network of Gun peers, not a central server.
- **End-to-End Encrypted:** All messages and room keys are secured using cryptographic secrets derived from shared encryption keys.
- **Session Management:** Users can add/remove network peers, and all application state (rooms, invites) is linked to your cryptographic identity.
- **Multimedia Support:** Supports sending encrypted images and downloadable files (including 3D models visualized with the help of [three.js](https://threejs.org/)).

## Try it out
You can try it out [here](https://eecs.blog/BlazorApps/DecentChat/)
