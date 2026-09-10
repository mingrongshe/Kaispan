import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { HaccpAccessGuard, RequireHaccpFill, RequireHaccpManage } from "../access/haccp-access.guard";
import { Ctx } from "../context/ctx.decorator";
import type { CurrentContext } from "../context/current-context";
import { SessionGuard } from "../context/session.guard";
import { CompleteWorkOrderDto, CreateEquipmentDto } from "../haccp/haccp.dto";
import { EquipmentService } from "./equipment.service";

@ApiTags("equipment")
@Controller("equipment")
@UseGuards(SessionGuard, HaccpAccessGuard)
export class EquipmentController {
  constructor(private readonly equipment: EquipmentService) {}

  /** 看设备和趋势员工也可以（只读），开维修单不行 */
  @Get()
  @RequireHaccpFill()
  list(@Ctx() ctx: CurrentContext) {
    return this.equipment.list(ctx);
  }

  @Get(":id")
  @RequireHaccpFill()
  get(@Ctx() ctx: CurrentContext, @Param("id") id: string) {
    return this.equipment.get(ctx, id);
  }

  @Get(":id/trend")
  @RequireHaccpFill()
  trend(@Ctx() ctx: CurrentContext, @Param("id") id: string, @Query("days") days?: string) {
    return this.equipment.trend(ctx, id, days ? Number(days) : 30);
  }

  @Post()
  @RequireHaccpManage()
  create(@Ctx() ctx: CurrentContext, @Body() body: CreateEquipmentDto) {
    return this.equipment.create(ctx, body);
  }

  @Post("work-orders/:id/complete")
  @RequireHaccpManage()
  complete(@Ctx() ctx: CurrentContext, @Param("id") id: string, @Body() body: CompleteWorkOrderDto) {
    return this.equipment.completeWorkOrder(ctx, id, body.result);
  }
}
