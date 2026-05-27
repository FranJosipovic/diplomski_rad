namespace api.DTOs;

public record ThresholdRequest(decimal Threshold);

public record StartSesijaRequest(
    int ModId,
    decimal Threshold,
    int? IntervalMinuta,
    int? IntervalPaljenja,
    int? TrajanjePaljenja,
    string? Napomena
);
