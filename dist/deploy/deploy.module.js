"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeployModule = void 0;
const common_1 = require("@nestjs/common");
const ssh_module_1 = require("../services/ssh.module");
const deploy_controller_1 = require("./deploy.controller");
const deploy_service_1 = require("./deploy.service");
const node_stack_1 = require("./stacks/node.stack");
const stack_registry_1 = require("./stacks/stack.registry");
let DeployModule = class DeployModule {
};
exports.DeployModule = DeployModule;
exports.DeployModule = DeployModule = __decorate([
    (0, common_1.Module)({
        imports: [ssh_module_1.SshModule],
        controllers: [deploy_controller_1.DeployController],
        providers: [deploy_service_1.DeployService, stack_registry_1.StackRegistry, node_stack_1.NodeStack],
    })
], DeployModule);
//# sourceMappingURL=deploy.module.js.map