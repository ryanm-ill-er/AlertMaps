// server.js
const { client, xml } = require('@xmpp/client');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files (frontend)
app.use(express.static(path.join(__dirname, 'public')));

server.listen(3000, () => console.log('🌐 Server running at http://localhost:3000'));

// XMPP setup
const xmpp = client({
    service: 'xmpp://nwws-oi.weather.gov', // Your XMPP service URL
    domain: 'weather.gov',
    username: 'ryder.moesta',  // Your XMPP username
    password: 'n5_7ctVaOosHZ6s'  // Your XMPP password
});

const ROOM_JID = 'nwws@conference.nwws-oi.weather.gov'; // XMPP room where alerts are sent

// Handle XMPP connection
xmpp.on('online', () => {
    console.log('✅ Connected to XMPP');
    xmpp.send(xml('presence', { to: `${ROOM_JID}/ryder.moesta` }, xml('x', { xmlns: 'http://jabber.org/protocol/muc' })));
});

// Handle incoming XMPP messages
xmpp.on('stanza', (stanza) => {
    if (stanza.is('message') && stanza.attrs.type === 'groupchat') {
        const body = stanza.getChildText('body');
        if (!body || !body.includes('<event>')) return;

        const event = getXmlValue(body, 'event');
        const areaDesc = getXmlValue(body, 'areaDesc');
        const expires = getXmlValue(body, 'expires');
        const polygon = getXmlValue(body, 'polygon');

        const damageThreat = getXmlValue(body, 'value', 'tornadoDamageThreat') || getXmlValue(body, 'value', 'thunderstormDamageThreat');
        const detection = getXmlValue(body, 'value', 'tornadoDetection');

        let warningEvent = event;

        if (event?.includes("Tornado Warning")) {
            if (damageThreat === "Considerable") warningEvent = "PDS Tornado Warning";
            else if (damageThreat === "Catastrophic") warningEvent = "Tornado Emergency";
            else if (detection === "OBSERVED") warningEvent = "Observed Tornado Warning";
        } else if (event?.includes("Severe Thunderstorm Warning")) {
            if (damageThreat === "Considerable") warningEvent = "Considerable Severe Thunderstorm Warning";
            else if (damageThreat === "Destructive") warningEvent = "Destructive Severe Thunderstorm Warning";
        }

        const readableExpires = new Date(expires).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        const warning = {
            properties: {
                event: warningEvent,
                areaDesc: areaDesc,
                expires: readableExpires,
                polygon: polygon
            }
        };

        // Emit warning to clients
        io.emit('new-alert', warning);
        console.log('Received alert:', alert); // 👈 Log it here
    }
});

// XMPP error handling
xmpp.on('error', err => console.error('❌ XMPP Error:', err));
xmpp.on('offline', () => {
    console.log('🔴 XMPP Offline');
    xmpp.start().catch(console.error);
});

// Start XMPP connection
xmpp.start().catch(console.error);

// Function to extract value from XML string
function getXmlValue(xmlStr, tag, attrName = null) {
    const regex = attrName
        ? new RegExp(`<valueName>\\s*${attrName}\\s*</valueName>\\s*<value>(.*?)<\\/value>`, 'i')
        : new RegExp(`<${tag}>(.*?)<\\/${tag}>`, 'i');
    const match = xmlStr.match(regex);
    return match ? match[1].trim() : null;
}
