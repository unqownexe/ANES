// ANES Browser Agent — Chrome native messaging köprüsü.
// Chrome'un başlattığı bu küçük yardımcı, stdio üzerindeki uzunluk-önekli JSON
// çerçevelerini ANES'in adlandırılmış kanalına (\\.\pipe\ANES_AI_Bridge) aktarır.
// Token yalnız ANES'in yazdığı dosyadan okunur; Chrome tarafına verilmez.
#ifndef NOMINMAX
#define NOMINMAX
#endif
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>
#include <atomic>
#include <cstdio>
#include <cstdlib>
#include <string>
#include <thread>
#include <vector>
#include <io.h>
#include <fcntl.h>

namespace {

constexpr wchar_t kPipeName[] = L"\\\\.\\pipe\\ANES_AI_Bridge";
constexpr DWORD   kMaxFrame = 1024 * 1024;

HANDLE g_pipe = INVALID_HANDLE_VALUE;
HANDLE g_done = nullptr;

std::string WideToUtf8(const std::wstring& w) {
    if (w.empty()) return std::string();
    const int n = WideCharToMultiByte(CP_UTF8, 0, w.c_str(), (int)w.size(),
                                      nullptr, 0, nullptr, nullptr);
    if (n <= 0) return std::string();
    std::string out((size_t)n, '\0');
    WideCharToMultiByte(CP_UTF8, 0, w.c_str(), (int)w.size(), out.data(), n, nullptr, nullptr);
    return out;
}

bool ReadExactSync(HANDLE h, void* data, DWORD size) {
    unsigned char* p = static_cast<unsigned char*>(data);
    DWORD left = size;
    while (left > 0) {
        DWORD got = 0;
        if (!ReadFile(h, p, left, &got, nullptr) || got == 0) return false;
        p += got;
        left -= got;
    }
    return true;
}

bool WriteExactSync(HANDLE h, const void* data, DWORD size) {
    const unsigned char* p = static_cast<const unsigned char*>(data);
    DWORD left = size;
    while (left > 0) {
        DWORD wrote = 0;
        if (!WriteFile(h, p, left, &wrote, nullptr) || wrote == 0) return false;
        p += wrote;
        left -= wrote;
    }
    return true;
}

// Kanal çift yönlü ve iki ayrı iş parçacığından okunup yazılıyor. Senkron
// (overlapped olmayan) tanıtıcıda Windows okuma/yazmayı sıraya koyduğu için
// yazma, bekleyen okuma bitene kadar kilitleniyordu. Kanal bu yüzden
// FILE_FLAG_OVERLAPPED ile açılır ve her işlem kendi olayıyla beklenir.
bool WaitOverlapped(HANDLE h, OVERLAPPED& ov, DWORD& got) {
    if (WaitForSingleObject(ov.hEvent, INFINITE) != WAIT_OBJECT_0) return false;
    return GetOverlappedResult(h, &ov, &got, FALSE) != 0;
}

bool ReadExactOv(HANDLE h, void* data, DWORD size) {
    unsigned char* p = static_cast<unsigned char*>(data);
    DWORD left = size;
    OVERLAPPED ov = {};
    ov.hEvent = CreateEventW(nullptr, TRUE, FALSE, nullptr);
    if (!ov.hEvent) return false;
    while (left > 0) {
        DWORD got = 0;
        if (!ReadFile(h, p, left, &got, &ov)) {
            if (GetLastError() != ERROR_IO_PENDING || !WaitOverlapped(h, ov, got)) {
                CloseHandle(ov.hEvent);
                return false;
            }
        }
        if (got == 0) {
            CloseHandle(ov.hEvent);
            return false;
        }
        p += got;
        left -= got;
        ResetEvent(ov.hEvent);
    }
    CloseHandle(ov.hEvent);
    return true;
}

bool WriteExactOv(HANDLE h, const void* data, DWORD size) {
    const unsigned char* p = static_cast<const unsigned char*>(data);
    DWORD left = size;
    OVERLAPPED ov = {};
    ov.hEvent = CreateEventW(nullptr, TRUE, FALSE, nullptr);
    if (!ov.hEvent) return false;
    while (left > 0) {
        DWORD wrote = 0;
        if (!WriteFile(h, p, left, &wrote, &ov)) {
            if (GetLastError() != ERROR_IO_PENDING || !WaitOverlapped(h, ov, wrote)) {
                CloseHandle(ov.hEvent);
                return false;
            }
        }
        if (wrote == 0) {
            CloseHandle(ov.hEvent);
            return false;
        }
        p += wrote;
        left -= wrote;
        ResetEvent(ov.hEvent);
    }
    CloseHandle(ov.hEvent);
    return true;
}

bool ReadFrameSync(HANDLE h, std::vector<char>& out) {
    unsigned char lenBytes[4] = {};
    if (!ReadExactSync(h, lenBytes, 4)) return false;
    const DWORD len = (DWORD)lenBytes[0] | ((DWORD)lenBytes[1] << 8) |
                      ((DWORD)lenBytes[2] << 16) | ((DWORD)lenBytes[3] << 24);
    if (len == 0 || len > kMaxFrame) return false;
    out.resize(len);
    return ReadExactSync(h, out.data(), len);
}

bool WriteFrameSync(HANDLE h, const std::vector<char>& data) {
    if (data.empty() || data.size() > kMaxFrame) return false;
    const DWORD len = (DWORD)data.size();
    unsigned char lenBytes[4] = {
        (unsigned char)(len & 0xFF), (unsigned char)((len >> 8) & 0xFF),
        (unsigned char)((len >> 16) & 0xFF), (unsigned char)((len >> 24) & 0xFF)
    };
    return WriteExactSync(h, lenBytes, 4) && WriteExactSync(h, data.data(), len);
}

bool ReadFrameOv(HANDLE h, std::vector<char>& out) {
    unsigned char lenBytes[4] = {};
    if (!ReadExactOv(h, lenBytes, 4)) return false;
    const DWORD len = (DWORD)lenBytes[0] | ((DWORD)lenBytes[1] << 8) |
                      ((DWORD)lenBytes[2] << 16) | ((DWORD)lenBytes[3] << 24);
    if (len == 0 || len > kMaxFrame) return false;
    out.resize(len);
    return ReadExactOv(h, out.data(), len);
}

bool WriteFrameOv(HANDLE h, const std::vector<char>& data) {
    if (data.empty() || data.size() > kMaxFrame) return false;
    const DWORD len = (DWORD)data.size();
    unsigned char lenBytes[4] = {
        (unsigned char)(len & 0xFF), (unsigned char)((len >> 8) & 0xFF),
        (unsigned char)((len >> 16) & 0xFF), (unsigned char)((len >> 24) & 0xFF)
    };
    return WriteExactOv(h, lenBytes, 4) && WriteExactOv(h, data.data(), len);
}

std::wstring LocalAppData() {
    wchar_t buf[MAX_PATH * 2] = {};
    const DWORD n = GetEnvironmentVariableW(L"LOCALAPPDATA", buf, (DWORD)(sizeof(buf) / sizeof(buf[0])));
    if (n == 0 || n >= sizeof(buf) / sizeof(buf[0])) return std::wstring();
    return std::wstring(buf, n);
}

std::string ReadToken() {
    const std::wstring base = LocalAppData();
    if (base.empty()) return std::string();
    const std::wstring path = base + L"\\Webtelya\\ANES\\browser_bridge.token";
    HANDLE f = CreateFileW(path.c_str(), GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE,
                           nullptr, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (f == INVALID_HANDLE_VALUE) return std::string();
    std::string data;
    char buf[512];
    DWORD got = 0;
    while (ReadFile(f, buf, sizeof(buf), &got, nullptr) && got > 0) {
        data.append(buf, got);
        if (data.size() > 4096) break;
    }
    CloseHandle(f);
    const size_t a = data.find_first_not_of(" \t\r\n");
    if (a == std::string::npos) return std::string();
    const size_t b = data.find_last_not_of(" \t\r\n");
    return data.substr(a, b - a + 1);
}

HANDLE ConnectPipe() {
    // ANES sunucusu yeni başlamış olabilir; kısa süre yeniden dene.
    for (int i = 0; i < 60; ++i) {
        HANDLE h = CreateFileW(kPipeName, GENERIC_READ | GENERIC_WRITE, 0, nullptr,
                               OPEN_EXISTING, FILE_FLAG_OVERLAPPED, nullptr);
        if (h != INVALID_HANDLE_VALUE) return h;
        Sleep(100);
    }
    return INVALID_HANDLE_VALUE;
}

void Finish() {
    if (g_done) SetEvent(g_done);
}

void PumpStdinToPipe() {
    std::vector<char> frame;
    while (ReadFrameSync(GetStdHandle(STD_INPUT_HANDLE), frame)) {
        if (!WriteFrameOv(g_pipe, frame)) break;
    }
    Finish();
}

void PumpPipeToStdout() {
    std::vector<char> frame;
    while (ReadFrameOv(g_pipe, frame)) {
        if (!WriteFrameSync(GetStdHandle(STD_OUTPUT_HANDLE), frame)) break;
    }
    Finish();
}

} // namespace

int wmain() {
    _setmode(_fileno(stdin), _O_BINARY);
    _setmode(_fileno(stdout), _O_BINARY);

    g_done = CreateEventW(nullptr, TRUE, FALSE, nullptr);
    if (!g_done) return 1;

    const std::string token = ReadToken();
    if (token.empty()) return 1;

    g_pipe = ConnectPipe();
    if (g_pipe == INVALID_HANDLE_VALUE) return 1;

    const std::string auth =
        "{\"v\":1,\"type\":\"auth\",\"id\":\"native-host\",\"ts\":0,\"payload\":{\"token\":\"" +
        token + "\",\"host\":\"anes_native_host\",\"version\":\"1.0.0\"}}";
    if (!WriteFrameOv(g_pipe, std::vector<char>(auth.begin(), auth.end()))) {
        CloseHandle(g_pipe);
        return 1;
    }

    std::thread in(PumpStdinToPipe);
    std::thread out(PumpPipeToStdout);
    in.detach();
    out.detach();

    WaitForSingleObject(g_done, INFINITE);
    // Diğer yönü uyandırmak için kanalı kapat.
    if (g_pipe != INVALID_HANDLE_VALUE) {
        CloseHandle(g_pipe);
        g_pipe = INVALID_HANDLE_VALUE;
    }
    CloseHandle(g_done);
    g_done = nullptr;
    return 0;
}
