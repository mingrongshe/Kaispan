import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from "class-validator";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const SHIFT_KINDS = ["opening", "midday", "closing"] as const;
export const ENTRY_STATUSES = ["draft", "submitted", "issue_open", "issue_resolved"] as const;

export class DateQuery {
  @ApiPropertyOptional({ example: "2026-09-10", description: "不传就是门店当地的今天" })
  @IsOptional()
  @Matches(ISO_DATE, { message: "日期格式应该是 YYYY-MM-DD" })
  date?: string;
}

export class ListEntriesQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  templateId?: string;

  @ApiPropertyOptional({ example: "2026-09-01" })
  @IsOptional()
  @Matches(ISO_DATE)
  from?: string;

  @ApiPropertyOptional({ example: "2026-09-30" })
  @IsOptional()
  @Matches(ISO_DATE)
  to?: string;

  @ApiPropertyOptional({ enum: ENTRY_STATUSES })
  @IsOptional()
  @IsIn(ENTRY_STATUSES)
  status?: (typeof ENTRY_STATUSES)[number];

  @ApiPropertyOptional({ description: "把已作废的也列出来" })
  @IsOptional()
  // query string 传上来的是 "true" 这个字符串，不转一下 IsBoolean 会直接拒掉
  @Transform(({ value }) => value === true || value === "true")
  @IsBoolean()
  includeVoided?: boolean;
}

export class SaveDraftDto {
  @ApiProperty() @IsString() templateId!: string;
  @ApiProperty({ example: "2026-09-10" }) @Matches(ISO_DATE) entryDate!: string;
  @ApiProperty({ type: Object, description: "列 id → 值" }) @IsObject() values!: Record<string, unknown>;
  @ApiPropertyOptional({ type: Object }) @IsOptional() @IsObject() header?: Record<string, unknown>;
}

export class SubmitDto extends SaveDraftDto {
  @ApiPropertyOptional({ description: "有超标项时必填" })
  @IsOptional()
  @IsString()
  correctiveAction?: string;

  @ApiPropertyOptional({ description: "补填过期日期时必填，至少 5 个字" })
  @IsOptional()
  @IsString()
  lateReason?: string;
}

export class VoidDto {
  @ApiProperty({ description: "作废必须写理由" }) @IsString() reason!: string;
}

export class ResolveDto {
  @ApiPropertyOptional({ description: "挂不上设备的异常，写处理结果" })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({ description: "温度类异常，挂到这台设备" })
  @IsOptional()
  @IsString()
  equipmentId?: string;

  @ApiPropertyOptional({ description: "维修单写什么坏了" })
  @IsOptional()
  @IsString()
  workOrderNote?: string;
}

export class AssignTemplateDto {
  @ApiProperty({ enum: SHIFT_KINDS, nullable: true, description: "null 表示撤销派单" })
  @IsOptional()
  @IsIn(SHIFT_KINDS)
  shiftKind?: (typeof SHIFT_KINDS)[number] | null;

  @ApiProperty({ example: "2026-09-14", description: "从这一天起生效，旧规则在这天封口" })
  @Matches(ISO_DATE)
  fromDate!: string;
}

export class SetShiftDto {
  @ApiProperty({ example: "2026-09-10" }) @Matches(ISO_DATE) date!: string;
  @ApiProperty({ enum: SHIFT_KINDS }) @IsIn(SHIFT_KINDS) kind!: (typeof SHIFT_KINDS)[number];
  @ApiProperty({ type: [String], description: "这一班上的人，空数组表示没人" })
  @IsArray()
  @IsString({ each: true })
  userIds!: string[];
}

export class SetShiftDefinitionDto {
  @ApiProperty({ enum: SHIFT_KINDS }) @IsIn(SHIFT_KINDS) kind!: (typeof SHIFT_KINDS)[number];
  @ApiProperty({ example: 390 }) @IsInt() @Min(0) @Max(1440) startMinutes!: number;
  @ApiProperty({ example: 870 }) @IsInt() @Min(0) @Max(1440) endMinutes!: number;
}

export class WeekQuery {
  @ApiProperty({ example: "2026-09-07" }) @Matches(ISO_DATE) from!: string;
  @ApiProperty({ example: "2026-09-13" }) @Matches(ISO_DATE) to!: string;
}

export class CreateEquipmentDto {
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() location?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() linkTemplateId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() linkColumnId?: string;
}

export class MonthQuery {
  @ApiPropertyOptional({ example: "2026-09", description: "不传就是当月" })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/, { message: "月份格式应该是 YYYY-MM" })
  month?: string;
}

export class CompleteWorkOrderDto {
  @ApiProperty({ description: "修了什么，不写不算完成" }) @IsString() result!: string;
}
