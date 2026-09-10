import { Module } from "@nestjs/common";
import { EquipmentController } from "../equipment/equipment.controller";
import { EquipmentService } from "../equipment/equipment.service";
import { EntriesService } from "./entries.service";
import { HaccpController } from "./haccp.controller";
import { ManageController } from "./manage.controller";
import { ManageService } from "./manage.service";
import { TasksService } from "./tasks.service";
import { TemplatesService } from "./templates.service";

@Module({
  controllers: [HaccpController, ManageController, EquipmentController],
  providers: [TemplatesService, TasksService, EntriesService, ManageService, EquipmentService],
})
export class HaccpModule {}
