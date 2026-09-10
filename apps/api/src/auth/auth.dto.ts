import { ApiProperty } from "@nestjs/swagger";
import { IsString, MinLength } from "class-validator";

export class LoginDto {
  @ApiProperty({ example: "olivia" })
  @IsString()
  @MinLength(1)
  loginCode!: string;
}

export class MeDto {
  @ApiProperty() userId!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: ["employee", "store_manager"] }) role!: "employee" | "store_manager";
  @ApiProperty({ enum: ["zh", "de"] }) locale!: "zh" | "de";
  @ApiProperty() organizationId!: string;
  @ApiProperty() organizationName!: string;
  @ApiProperty() unitId!: string;
  @ApiProperty() unitName!: string;
  /** 前端可以据此调整页面，但每个受保护的接口后端都会再查一次 */
  @ApiProperty() canFillHaccp!: boolean;
  @ApiProperty() canManageHaccp!: boolean;
}
