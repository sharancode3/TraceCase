import * as React from 'react';

interface LogoProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  className?: string;
  color?: string;
}

export function TraceCaseLogo({
  size = 28,
  className = '',
  color = '#4767DB',
  ...props
}: LogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 260 293"
      width={size}
      height={size}
      fill={color}
      className={`shrink-0 ${className}`}
      aria-label="TraceCase Logo"
      {...props}
    >
      {/* Top Rounded Bar */}
      <path fill={color} style={{ fill: color }} d="M 23 25 L 23 50 L 24 56 L 218 57 L 226 55 L 227 53 L 227 27 L 226 24 L 33 23 Z" />
      {/* Main T Hook & Outer Arc */}
      <path fill={color} style={{ fill: color }} d="M 58 260 L 60 262 L 90 261 L 91 228 L 99 200 L 110 179 L 127 159 L 145 144 L 169 132 L 195 126 L 226 124 L 227 93 L 23 92 L 24 124 L 106 125 L 109 130 L 93 146 L 83 159 L 67 189 L 57 232 Z" />
      {/* Middle Arc */}
      <path fill={color} style={{ fill: color }} d="M 226 161 L 224 160 L 206 160 L 197 161 L 184 164 L 181 166 L 176 167 L 168 171 L 158 178 L 150 185 L 137 202 L 129 219 L 126 233 L 126 258 L 130 262 L 160 262 L 159 237 L 160 232 L 164 224 L 165 220 L 170 213 L 178 205 L 187 199 L 191 198 L 197 195 L 211 193 L 227 192 L 227 163 Z" />
      {/* Bottom Right Dot */}
      <path fill={color} style={{ fill: color }} d="M 205 229 L 201 231 L 196 236 L 194 240 L 194 249 L 195 252 L 196 254 L 201 259 L 205 261 L 216 261 L 218 260 L 221 258 L 224 255 L 226 251 L 227 247 L 227 244 L 226 239 L 225 237 L 223 234 L 220 231 L 216 229 L 211 228 L 209 228 Z" />
    </svg>
  );
}
