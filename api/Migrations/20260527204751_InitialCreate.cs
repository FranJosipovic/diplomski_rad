using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace api.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "mod",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Naziv = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_mod", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "sesija",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ModId = table.Column<int>(type: "integer", nullable: false),
                    Threshold = table.Column<decimal>(type: "numeric(5,2)", nullable: false),
                    IntervalMinuta = table.Column<int>(type: "integer", nullable: true),
                    IntervalPaljenja = table.Column<int>(type: "integer", nullable: true),
                    TrajanjePaljenja = table.Column<int>(type: "integer", nullable: true),
                    Pocetak = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Kraj = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    Napomena = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_sesija", x => x.Id);
                    table.ForeignKey(
                        name: "FK_sesija_mod_ModId",
                        column: x => x.ModId,
                        principalTable: "mod",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "event_pumpe",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    SesijaId = table.Column<int>(type: "integer", nullable: false),
                    Timestamp = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Status = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_event_pumpe", x => x.Id);
                    table.ForeignKey(
                        name: "FK_event_pumpe_sesija_SesijaId",
                        column: x => x.SesijaId,
                        principalTable: "sesija",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ocitavanje",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    SesijaId = table.Column<int>(type: "integer", nullable: false),
                    Timestamp = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Vlaga = table.Column<decimal>(type: "numeric(5,2)", nullable: false),
                    Temperatura = table.Column<decimal>(type: "numeric(5,2)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ocitavanje", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ocitavanje_sesija_SesijaId",
                        column: x => x.SesijaId,
                        principalTable: "sesija",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.InsertData(
                table: "mod",
                columns: new[] { "Id", "Naziv" },
                values: new object[,]
                {
                    { 1, "pull" },
                    { 2, "push" },
                    { 3, "timer" }
                });

            migrationBuilder.CreateIndex(
                name: "IX_event_pumpe_SesijaId",
                table: "event_pumpe",
                column: "SesijaId");

            migrationBuilder.CreateIndex(
                name: "IX_ocitavanje_SesijaId",
                table: "ocitavanje",
                column: "SesijaId");

            migrationBuilder.CreateIndex(
                name: "IX_sesija_ModId",
                table: "sesija",
                column: "ModId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "event_pumpe");

            migrationBuilder.DropTable(
                name: "ocitavanje");

            migrationBuilder.DropTable(
                name: "sesija");

            migrationBuilder.DropTable(
                name: "mod");
        }
    }
}
