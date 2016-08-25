'use strict';
const express = require('express'),
    app = express(),
    server = require('http').Server(app),
    io = require('socket.io')(server);

const libnvml = require('./libnvml.js');
const nvml = libnvml.DefaultManager;
const deviceList = nvml.deviceList();

let subscribers = {};

app.use(express.static('assest'));

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

io.sockets.on('connection', socket => {
    socket.emit('device-list', {
        'devices': deviceList.map(dev => {
            return {
                id: dev.pciInfo.device,
                name: dev.name
            };
        })
    });

    subscribers[socket] = (data) => {
        socket.emit("update", data);
    }

    socket.on("disconnect", () => {
        subscribers[socket] = undefined;
        console.log("disconnected");
        console.log(subscribers);
    });
});

server.listen(3000);

setInterval(() => {
    let updateData = [];

    for (let dev of deviceList) {
        dev.updateCounters();

        let gpu = {};
        gpu.utilization = dev.utilization;
        gpu.memory = dev.memoryInfo;
        gpu.temperature = dev.temperature;
        gpu.clock = dev.clockInfo;
        gpu.powerUsage = dev.powerUsage;
        gpu.fanSpeed = dev.fanSpeed;

        updateData[dev.pciInfo.device] = gpu;
    }

    for (let sub in subscribers) {
        if (subscribers[sub]) {
            subscribers[sub](updateData);
        }
    }
}, 1000);