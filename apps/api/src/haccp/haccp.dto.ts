import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";

export class ListEntriesQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  templateId?: string;
}

export class EntrySummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() templateId!: string;
  @ApiProperty() templateVersion!: number;
  @ApiProperty({ example: "2026-09-10" }) entryDate!: string;
  @ApiProperty({ enum: ["draft", "submitted", "issue_open", "issue_resolved"] })
  status!: "draft" | "submitted" | "issue_open" | "issue_resolved";
  @ApiProperty() isLate!: boolean;
  @ApiProperty() filledByName!: string;
}
