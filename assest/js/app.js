function visualize(container) {
    var chart = echarts.init(container);

    function update(visModel) {
        console.log(visModel);
    }

    return update;
}

$(document).ready(function () {
    var socket = io("http://localhost:3000");

    var initData = function() {
        return {
            'gpu-utilization': [],
            'memory-utilization': [],
            'used-memory': [],
            'temperature': [],
            'clock': [],
            'power-usage': [],
            'fan-speed': []
        };
    }

    var visModel = {
        maxDataFrameCount: 5000,

        deviceId: 0,
        watchedAttrs: ['temperature'],
        data: [],

        update: function (newDataFrame) {
            var data = this.data;
            
            newDataFrame.forEach((gpu, index) => {
                if (!data[index]) {
                    data[index] = initData();
                }

                var dt = data[index];
                dt['gpu-utilization'].push(gpu.utilization.gpu);
                dt['memory-utilization'].push(gpu.utilization.memory);
                dt['used-memory'].push(gpu.memory.used);
                dt['temperature'].push(gpu.temperature);
                dt['clock'].push(gpu.clock);

                for (var attr in dt) {
                    if (dt[attr].length >= this.maxDataFrameCount) {
                        dt[attr].shift();
                    }
                }
            });
        }
    };

    var visualizer = visualize(document.getElementById('chart-container'));

    // mainChart.setOption(createTemperature());
    var deviceListSelObj = $("#device-list");
    deviceListSelObj.change(function (opt) {
        visModel.deviceId = deviceListSelObj.val();
        visualizer(visModel);
    });

    socket.on("device-list", function (data) {
        data.devices.forEach(function (device) {
            deviceListSelObj.append("<option value=" + device.id + ">" + device.id + ". " + device.name + "</option>");
        });

        deviceListSelObj.append("<option value=-1>-1. mock </option>");
    });

    socket.on("update", function (data) {
        visModel.update(data);
        visualizer(visModel);
    });

    socket.on("disconnect", function () {
        alert('Server disconnected!');
        socket.close();
    })
});