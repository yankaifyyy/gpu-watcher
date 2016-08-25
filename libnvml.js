'use strict';

const ffi = require('ffi'),
    ref = require('ref'),
    struct = require('ref-struct'),
    arrayType = require('ref-array');

const nvmlReturn = {
    NVML_SUCCESS: 0,
    NVML_ERROR_UNINITIALIZED: 1,
    NVML_ERROR_INVALID_ARGUMENT: 2,
    NVML_ERROR_NOT_SUPPORTED: 3,
    NVML_ERROR_NO_PERMISSON: 4,
    NVML_ERROR_ALREADY_INITIALIZED: 5,
    NVML_ERROR_NOT_FOUND: 6,
    NVML_ERROR_INSUFFICIENT_SIZE: 7,
    NVML_ERROR_INSUFFICIENT_POWER: 8,
    NVML_ERROR_DRIVER_NOT_LOADED: 9,
    NVML_ERROR_TIMEOUT: 10,
    NVML_ERROR_IRQ_ISSUE: 11,
    NVML_ERROR_LIBRARY_NOT_FOUND: 12,
    NVML_ERROR_FUNCTION_NOT_FOUND: 13,
    NVML_ERROR_CORRUPTED_INFOROM: 14,
    NVML_ERROR_GPU_IS_LOST: 15,
    NVML_ERROR_REST_REQUIRED: 16,
    NVML_ERROR_OPERATING_SYSTEM: 17,
    NVML_ERROR_UNKNOWN: 999
};
let returnMessage = {};
for (let msg in nvmlReturn) {
    returnMessage[nvmlReturn[msg]] = msg;
}
function errorMessage(errCode) {
    if (errCode in returnMessage) {
        return returnMessage[errCode];
    } else {
        return 'ERROR CODE: ' + errCode;
    }
}

const nvmlPciInfo_t = struct({
    'busId': new arrayType('char', 16),
    'domain': 'uint',
    'bus': 'uint',
    'device': 'uint',
    'pciDeviceId': 'uint',
    'pciSubSystemId': 'uint',
    
    'reserve0': 'uint',
    'reserve1': 'uint',
    'reserve2': 'uint',
    'reserve3': 'uint'
});
function pciInfo(nvml_pci_info) {
    return {
        busId: ref.readCString(nvml_pci_info.busId.buffer),
        domain: nvml_pci_info.domain,
        bus: nvml_pci_info.bus,
        device: nvml_pci_info.device,
        pciDeviceId: nvml_pci_info.pciDeviceId,
        pciSubSystemId: nvml_pci_info.pciSubSystemId
    };
}

const nvmlUtilization_t = struct({
    'gpu': 'uint',
    'memory': 'uint'
});
function utilization(nvml_utilization) {
    return {
        gpu: nvml_utilization.gpu,
        memory: nvml_utilization.memory
    };
}

const nvmlMemory_t = struct({
    'total': ref.types.ulonglong,
    'free': ref.types.ulonglong,
    'used': ref.types.ulonglong
});
function memory(nvml_memory) {
    return {
        total: nvml_memory.total,
        free: nvml_memory.free,
        used: nvml_memory.used
    };
}

const nvmlTemperatureSensors = {
    NVML_TEMPERATURE_GPU: 0
};

const nvmlClockType = {
    NVML_CLOCK_GRAPHICS: 0,
    NVML_CLOCK_SM: 1,
    NVML_CLOCK_MEM: 2
};

let libnvml = ffi.Library('nvml.dll', {
    'nvmlInit': ['int', []],
    'nvmlShutdown': ['int', []],
    'nvmlDeviceGetCount': ['int', ['int *']],
    'nvmlDeviceGetHandleByIndex': ['int', ['uint', ref.refType('pointer')]],
    'nvmlDeviceGetName': ['int', ['pointer', 'char *', 'uint']],
    'nvmlDeviceGetUUID': ['int', ['pointer', 'char *', 'uint']],
    'nvmlDeviceGetPciInfo': ['int', ['pointer', ref.refType(nvmlPciInfo_t)]],
    'nvmlDeviceGetUtilizationRates': ['int', ['pointer', ref.refType(nvmlUtilization_t)]],
    'nvmlDeviceGetMemoryInfo': ['int', ['pointer', ref.refType(nvmlMemory_t)]],
    'nvmlDeviceGetTemperature': ['int', ['pointer', 'uint', 'uint *']],
    'nvmlDeviceGetClockInfo': ['int', ['pointer', 'uint', 'uint *']],
    'nvmlDeviceGetPowerUsage': ['int', ['pointer', 'uint *']],
    'nvmlDeviceGetFanSpeed': ['int', ['pointer', 'uint *']]
});

let verbose = false;
function checkSuccess(errCode) {
    if (errCode != nvmlReturn.NVML_SUCCESS) {
        if (verbose) {
            console.error("[ERROR] " + errorMessage(errCode));
        }
        return false;
    }
    return true;
}

class GpuDevice {
    constructor(deviceId) {
        this.deviceId = deviceId;

        const MaxStringLength = 128;

        let deviceRef = ref.NULL_POINTER;
        if (checkSuccess(libnvml.nvmlDeviceGetHandleByIndex(deviceId, deviceRef))) {
            this._device = ref.deref(deviceRef);

            let nameBuffer = new Buffer(MaxStringLength),
                uuidBuffer = new Buffer(MaxStringLength);
            let info = new nvmlPciInfo_t();
            if (checkSuccess(libnvml.nvmlDeviceGetName(this._device, nameBuffer, nameBuffer.length))) {
                this._name = ref.readCString(nameBuffer, 0);
            }
            if (checkSuccess(libnvml.nvmlDeviceGetUUID(this._device, uuidBuffer, uuidBuffer.length))) {
                this._uuid = ref.readCString(uuidBuffer, 0);
            }

            if (checkSuccess(libnvml.nvmlDeviceGetPciInfo(this._device, info.ref()))) {
                this._pciInfo = pciInfo(info);
            }
        }
    }

    get device() {
        return this._device;
    }

    get name() {
        return this._name;
    }

    get uuid() {
        return this._uuid;
    }

    get pciInfo() {
        return this._pciInfo;
    }

    get temperature() {
        return this._temperature;
    }

    get utilization() {
        return this._utilization;
    }

    get memoryInfo() {
        return this._memoryInfo;
    }

    get clockInfo() {
        return this._clockInfo;
    }

    get powerUsage() {
        return this._powerUsage;
    }

    get fanSpeed() {
        return this._fanSpeed;
    }

    updateCounters() {
        this._utilization = this.getUtilization();
        this._memoryInfo = this.getMemoryInfo();
        this._temperature = this.getTemperature();
        this._clockInfo = this.getClockInfo();
        this._powerUsage = this.getPowerUsage();
        this._fanSpeed = this.getFanSpeed();
    }

    getUtilization() {
        let util = new nvmlUtilization_t();
        let result = {
            gpu: 0.0,
            memory: 0.0
        };
        if (checkSuccess(libnvml.nvmlDeviceGetUtilizationRates(this._device, util.ref()))) {
            result = utilization(util);
        }
        return result;
    }

    getMemoryInfo() {
        let mem = new nvmlMemory_t();
        let result = {
            total: 0.0,
            free: 0.0,
            used: 0.0
        };
        if (checkSuccess(libnvml.nvmlDeviceGetMemoryInfo(this._device, mem.ref()))) {
            result = memory(mem);
        }
        return result;
    }

    getTemperature() {
        let tempRef = ref.alloc('uint');
        let temp = NaN;
        if (checkSuccess(libnvml.nvmlDeviceGetTemperature(this._device, nvmlTemperatureSensors.NVML_TEMPERATURE_GPU, tempRef))) {
            temp = ref.deref(tempRef);
        }
        return temp;
    }

    getClockInfo() {
        let clockRef = ref.alloc('uint');
        let clock = NaN;
        if (checkSuccess(libnvml.nvmlDeviceGetClockInfo(this._device, nvmlClockType.NVML_CLOCK_SM, clockRef))) {
            clock = ref.deref(clockRef);
        }
        return clock;
    }

    getPowerUsage() {
        let powerRef = ref.alloc('uint');
        let power = NaN;
        if (checkSuccess(libnvml.nvmlDeviceGetPowerUsage(this._device, powerRef))) {
            power = ref.deref(powerRef);
        }
        return power;
    }

    getFanSpeed() {
        let fanRef = ref.alloc('uint');
        let fan = NaN;
        if (checkSuccess(libnvml.nvmlDeviceGetFanSpeed(this._device, fanRef))) {
            fan = ref.deref(fanRef);
        }
        return fan;
    }
}

class Nvml {
    constructor() {
        checkSuccess(libnvml.nvmlInit());

        let deviceCountRef = ref.alloc(ref.types.int);
        if (checkSuccess(libnvml.nvmlDeviceGetCount(deviceCountRef))) {
            this._deviceCount = ref.deref(deviceCountRef);
        }

        this._deviceList = [];
    }

    get deviceCount() {
        return this._deviceCount;
    }

    deviceList() {
        let list = [];
        for (let i = 0; i < this._deviceCount; ++i) {
            list.push(this.device(i));
        }

        return list;
    }

    device(index) {
        let device = null;

        if (index < this._deviceCount) {
            if (!this._deviceList[index]) {
                this._deviceList[index] = new GpuDevice(index); 
            }

            device = this._deviceList[index];
        }

        return device;
    }
}

module.exports.GpuDevice = GpuDevice;
module.exports.Nvml = Nvml;
module.exports.DefaultManager = new Nvml();
module.exports.verbose = verbose;