# vmsp-ptz

## RTC access on the VMSP network

The app uses `https://ptz-rtc.vmspchurch.org/<path>/whep` for WebRTC
signaling. MediaMTX runs on the streaming PC at `192.168.100.252` in the
**Broadcast** network (VLAN 3, `192.168.100.0/24`). Its direct WebRTC media
listener uses TCP/UDP port `8189`; `8889` is the signaling listener behind the
HTTPS endpoint. HLS can work even when the direct RTC media path is blocked.

On 2026-09-27, viewers on the **Default** network (`192.168.0.0/19`) could
reach signaling and play HLS, but RTC failed. The Broadcast network's **Isolate
Network** setting blocked the streaming PC's media replies to Default. The
fix was this rule on `VMSP-Church-UDM` under **Traffic & Firewall Rules →
Advanced → LAN In**:

| Setting | Value |
| --- | --- |
| Name | `Allow RTC replies from MediaMTX to Default` |
| Action / protocol | Accept / TCP/UDP |
| Placement | Before Predefined, above the Broadcast isolation drop rule |
| Source | IP address `192.168.100.252`, source port `8189` |
| Destination | Network `Default`, IPv4 subnet |
| Advanced / Match State | Manual; Established and Related only |

This permits replies for RTC connections initiated from Default while keeping
other Broadcast-to-Default traffic isolated. It does not require exposing
`8889` directly to Default; signaling uses the HTTPS endpoint.

To check the path from a Mac on Default, run
`nc -G 3 -vz 192.168.100.252 8189`, then select RTC in the app and check a
live stream. After the rule was saved, the port check succeeded and the ATEM
and Main streams both played in RTC mode. If the PC's address or the RTC port
changes, update this rule and `mediamtx.yml` together.
