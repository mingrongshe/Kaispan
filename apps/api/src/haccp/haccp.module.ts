import { Module } from "@nestjs/common";
import { EquipmentController } from "../equipment/equipment.controller";
import { EquipmentService } from "../equipment/equipment.service";
import { FilesController } from "../files/files.controller";
import { FilesService } from "../files/files.service";
import { EditorService } from "./editor.service";
import { EntriesService } from "./entries.service";
import { HaccpController } from "./haccp.controller";
import { ManageController } from "./manage.controller";
import { ManageService } from "./manage.service";
import { ReportService } from "./report.service";
import { TasksService } from "./tasks.service";
import { TemplatesService } from "./templates.service";

@Module({
  controllers: [HaccpController, ManageController, EquipmentController, FilesController],
  providers: [TemplatesService, TasksService, EntriesService, ManageService, EditorService, ReportService, EquipmentService, FilesService],
})
export class HaccpModule {}
