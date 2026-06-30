var builder = WebApplication.CreateBuilder(args);

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy
            .AllowAnyOrigin()
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new()
    {
        Title = "Tapir .NET Test API",
        Version = "0.1.0",
        Description = "Small ASP.NET Core API fixture for testing Tapir."
    });
});

var app = builder.Build();

app.UseCors();
app.UseSwagger();
app.UseSwaggerUI();

var forecasts = new[]
{
    new WeatherForecast(1, "Yerevan", 32, "Sunny"),
    new WeatherForecast(2, "Seattle", 18, "Cloudy"),
    new WeatherForecast(3, "Lisbon", 26, "Breezy")
};

app.MapGet("/health", () => Results.Ok(new HealthResponse("ok", "tapir-dotnet-swagger-api")))
    .WithName("GetHealth")
    .WithTags("System")
    .WithSummary("Get API health");

app.MapGet("/weather", (string? city) =>
    {
        var results = string.IsNullOrWhiteSpace(city)
            ? forecasts
            : forecasts.Where(forecast => forecast.City.Equals(city, StringComparison.OrdinalIgnoreCase));

        return Results.Ok(results);
    })
    .WithName("ListWeather")
    .WithTags("Weather")
    .WithSummary("List weather forecasts");

app.MapGet("/weather/{id:int}", (int id) =>
    {
        var forecast = forecasts.FirstOrDefault(item => item.Id == id);
        return forecast is null ? Results.NotFound(new { error = "Forecast not found" }) : Results.Ok(forecast);
    })
    .WithName("GetWeather")
    .WithTags("Weather")
    .WithSummary("Get a weather forecast by ID");

app.Run();

public sealed record HealthResponse(string Status, string Service);

public sealed record WeatherForecast(int Id, string City, int TemperatureC, string Summary);
