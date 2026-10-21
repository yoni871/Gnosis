import { useState } from "react";
import { Check, CircleSlash, Pipette } from "lucide-react";

const presets = [
    { name: "Yellow", color: "#FFD54F", angle: "-42deg" },
    { name: "Green", color: "#81C784", angle: "-21deg" },
    { name: "Blue", color: "#64B5F6", angle: "0deg" },
    { name: "Pink", color: "#F06292", angle: "21deg" },
    { name: "Purple", color: "#BA68C8", angle: "42deg" }
];

export default function HighlightColorPicker({
    onSelect,
    disabled,
    onClear,
    hasHighlight
}) {
    // Custom colors stay local until the checkmark is clicked.
    const [customColor, setCustomColor] = useState("#FFD54F");

    return (
        <div className="gnosis-pen-picker">
            <div
                className="gnosis-pen-fan"
                role="group"
                aria-label="Preset highlight colors"
            >
                {presets.map(({ name, color, angle }) => (
                    <button
                        key={color}
                        type="button"
                        disabled={disabled}
                        aria-label={`Highlight ${name.toLowerCase()}`}
                        title={name}
                        className="gnosis-highlight-pen"
                        style={{
                            // CSS variables control each pen's appearance.
                            "--pen-color": color,
                            "--pen-angle": angle
                        }}
                        onClick={() => onSelect(color)}
                    >
                        {/* Decorative barrel, cap, and chisel-shaped tip. */}
                        <span
                            className="gnosis-pen-barrel"
                            aria-hidden="true"
                        >
                            <span className="gnosis-pen-cap" />
                            <span className="gnosis-pen-tip" />
                        </span>
                    </button>
                ))}
            </div>

            <div
                className="gnosis-pen-options"
                role="group"
                aria-label="Custom color and removal"
            >
                <button
                    type="button"
                    disabled={disabled || !hasHighlight}
                    aria-label="None: remove selected highlight colors"
                    title="None"
                    className="gnosis-palette-option"
                    onClick={onClear}
                >
                    <CircleSlash size={17} aria-hidden="true" />
                </button>

                <span className="gnosis-custom-color">
                    <Pipette size={16} aria-hidden="true" />

                    {/* Keep the native input available to touch and keyboard. */}
                    <input
                        type="color"
                        aria-label="Choose a custom highlight color"
                        title="Custom color"
                        value={customColor}
                        disabled={disabled}
                        onChange={(event) =>
                            setCustomColor(event.target.value)
                        }
                    />
                </span>

                <button
                    type="button"
                    disabled={disabled}
                    aria-label="Apply custom highlight color"
                    title="Apply custom color"
                    className="gnosis-palette-option gnosis-apply-color"
                    onClick={() => onSelect(customColor)}
                >
                    <Check size={17} aria-hidden="true" />
                </button>
            </div>
        </div>
    );
}